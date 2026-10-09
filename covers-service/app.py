#!/usr/bin/env python3
"""
SPACEBOOKs cover service — يلاقي غلاف الكتاب أونلاين، ينظّفه، يوضّحه، ويحطه بالقالب.

POST /cover  {"title": "...", "author": "...", "goodreadsUrl": "..."}
  200 → image/jpeg (1080×1350 جاهزة للدرايف)، والهيدرز:
        X-Cover-Source: abjjad | goodreads | googlebooks
        X-Cover-Url:    رابط الصورة الأصلية
  404 → {"found": false, "tried": [...]}
GET /health → ok

Only reachable inside the docker network (no published port); n8n calls it as
http://spacebooks-covers:8080/cover
"""

import http.cookiejar
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageChops, ImageEnhance, ImageFilter

from spacebooks_template import SETTINGS, compose, encode

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
TIMEOUT = 15

# نفس إعدادات صور الموقع الحالية (studio فاتح + انعكاس خفيف تحت الكتاب)
COVER_SETTINGS = {**SETTINGS, "reflect": True}


# ---------------------------------------------------------------- fetching
def get(url, binary=False):
    # fresh cookie jar per request: Goodreads redirects in a loop without cookies
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ar,en;q=0.8"})
    with opener.open(req, timeout=TIMEOUT) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")


def norm(t):
    t = urllib.parse.unquote_plus(str(t or ""))
    t = re.sub(r"[إأآا]", "ا", t)
    t = t.replace("ة", "ه").replace("ى", "ي")
    t = re.sub(r"[ً-ْ]", "", t)
    t = re.sub(r"[-_:()\[\],.]", " ", t)
    return re.sub(r"\s+", " ", t).strip().lower()


def ld_image(html):
    """Cover URL from the page's JSON-LD (Abjjad/Goodreads both have it)."""
    for block in re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', html):
        try:
            obj = json.loads(block)
        except ValueError:
            continue
        nodes = obj if isinstance(obj, list) else [obj]
        nodes = [g for o in nodes for g in ([o] + (o.get("@graph") or [] if isinstance(o, dict) else []))]
        # the Book node first (Abjjad wraps everything in @graph next to Organization/WebPage nodes)
        nodes.sort(key=lambda o: 0 if isinstance(o, dict) and o.get("@type") == "Book" else 1)
        for o in nodes:
            img = o.get("image") if isinstance(o, dict) else None
            if isinstance(img, dict):
                img = img.get("url")
            if isinstance(img, list):
                img = img[0] if img else None
            if isinstance(img, str) and img.startswith("http"):
                return img
    return None


def abjjad(title, author):
    """→ (exact_match, image_url) or None."""
    q = f"{title} {author}".strip()
    html = get("https://www.abjjad.com/search?kw=" + urllib.parse.quote(q))
    seen, cands = set(), []
    for path, bid, slug in re.findall(r'href="(/book/(\d+)/([^"/?]+)[^"]*)"', html):
        if bid not in seen:
            seen.add(bid)
            cands.append((path, norm(slug)))
    if not cands:
        return None
    target = norm(title)
    best = next((c for c in cands if c[1] == target), None)
    exact = best is not None
    best = best or next((c for c in cands if target in c[1] or c[1] in target), None) or cands[0]
    img = ld_image(get("https://www.abjjad.com" + best[0]))
    return (exact, img) if img else None


def goodreads(title, author, url=None):
    if not url:
        q = f"{title} {author}".strip()
        m = re.search(r"book/show/(\d+)", get("https://www.goodreads.com/search?q=" + urllib.parse.quote(q)))
        if not m:
            return None
        url = "https://www.goodreads.com/book/show/" + m.group(1)
    html = get(url)
    img = ld_image(html)
    if not img:
        m = re.search(r'<meta property="og:image" content="([^"]+)"', html)
        img = m.group(1) if m else None
    if not img or "nophoto" in img:
        return None
    return img


def googlebooks(title, author):
    q = f"intitle:{title}" + (f"+inauthor:{author}" if author else "")
    data = json.loads(get("https://www.googleapis.com/books/v1/volumes?maxResults=3&q=" + urllib.parse.quote(q)))
    for it in data.get("items", []):
        links = it.get("volumeInfo", {}).get("imageLinks", {})
        url = links.get("extraLarge") or links.get("large") or links.get("medium") or links.get("thumbnail")
        if url:
            url = url.replace("http://", "https://").replace("&edge=curl", "")
            return re.sub(r"zoom=\d", "zoom=0", url)
    return None


def candidates(title, author, gr_url):
    """Yield (source, url) in preference order, lazily — stop at the first usable image."""
    ab = None
    try:
        ab = abjjad(title, author)
    except Exception as e:
        print("abjjad:", e, file=sys.stderr)
    if ab and ab[0]:                      # exact Arabic title match on Abjjad = most reliable
        yield "abjjad", ab[1]
    try:
        g = goodreads(title, author, gr_url or None)
        if g:
            yield "goodreads", g
    except Exception as e:
        print("goodreads:", e, file=sys.stderr)
    if ab and not ab[0]:
        yield "abjjad", ab[1]
    try:
        g = googlebooks(title, author)
        if g:
            yield "googlebooks", g
    except Exception as e:
        print("googlebooks:", e, file=sys.stderr)


# ---------------------------------------------------------------- image cleanup
def flatten(img):
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, img).convert("RGB")


def strip_background(img, tol=28):
    """
    شيل الخلفية: الفراغ الموحّد حوالين الغلاف (أبيض/لون سادة، مثل صور أبجد
    اللي الغلاف فيها بنص كرت أبيض). بنقيس لون الحواف وبنقص كل صف/عمود بالكامل
    من نفس اللون، فالغلاف نفسه ما بينلمس.
    """
    w, h = img.size
    px = img.load()
    edge = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + \
           [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    bg = tuple(sorted(c[i] for c in edge)[len(edge) // 2] for i in range(3))
    diff = ImageChops.difference(img, Image.new("RGB", img.size, bg)).convert("L")
    bbox = diff.point(lambda v: 255 if v > tol else 0).getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    # ignore 1-2px specks: only crop when it actually removes a margin
    if (r - l) * (b - t) > 0.97 * w * h:
        return img
    return img.crop(bbox)


def enhance(img, target_h=1000):
    """وضّح: كبّر بـ Lanczos لارتفاع ثابت، شحذ خفيف، وتباين/ألوان أنعم بشوي."""
    if img.height < target_h:
        k = target_h / img.height
        img = img.resize((round(img.width * k), target_h), Image.LANCZOS)
        img = img.filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))
    else:
        img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))
    img = ImageEnhance.Contrast(img).enhance(1.03)
    img = ImageEnhance.Color(img).enhance(1.04)
    return img


def usable(img):
    """A real book cover: portrait, not tiny, not a blank placeholder."""
    w, h = img.size
    if h < 220 or w < 140:
        return False
    if not (0.45 <= w / h <= 0.9):
        return False
    lo, hi = img.convert("L").getextrema()
    return hi - lo > 40


def render(raw):
    img = strip_background(flatten(Image.open(io.BytesIO(raw))))
    if not usable(img):
        return None
    book = enhance(img).convert("RGBA")
    return encode(compose(book, COVER_SETTINGS), "cover.jpg")


def find_cover(title, author="", gr_url=""):
    tried = []
    for source, url in candidates(title, author, gr_url):
        try:
            out = render(get(url, binary=True))
        except Exception as e:
            tried.append({"source": source, "url": url, "error": str(e)})
            continue
        if out:
            return source, url, out, tried
        tried.append({"source": source, "url": url, "error": "not a usable cover"})
    return None, None, None, tried


# ---------------------------------------------------------------- http
class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/cover":
            return self._json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self._json(400, {"error": "bad json"})
        title = str(req.get("title") or "").strip()
        if not title:
            return self._json(400, {"error": "title is required"})
        source, url, out, tried = find_cover(title, str(req.get("author") or "").strip(),
                                             str(req.get("goodreadsUrl") or "").strip())
        print(f"[cover] {title!r} → {source or 'NOT FOUND'} {url or ''}", file=sys.stderr)
        if not out:
            return self._json(404, {"found": False, "tried": tried})
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(out)))
        self.send_header("X-Cover-Source", source)
        self.send_header("X-Cover-Url", url)
        self.end_headers()
        self.wfile.write(out)


if __name__ == "__main__":
    if len(sys.argv) > 1:  # CLI test: python app.py "اسم الكتاب" ["المؤلف"] > out.jpg
        s, u, out, tried = find_cover(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "")
        print(s, u, tried, file=sys.stderr)
        if out:
            sys.stdout.buffer.write(out)
        sys.exit(0 if out else 1)
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
