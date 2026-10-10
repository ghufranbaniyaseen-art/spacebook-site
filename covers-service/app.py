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
import time
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


def close_match(target, candidate):
    """
    مطابقة صارمة للعنوان: نفسه، أو عنوان أطول بيحتويه كامل، أو اختصار قريب جداً منه.
    (المطابقة المرنة كانت بتجيب «الأشرار» لغوركي بدل «مملكة الأشرار»)
    """
    t, c = norm(target), norm(candidate)
    if not t or not c:
        return False
    return t == c or t in c or (c in t and len(c) >= len(t) * 0.8)


def abjjad(title, author):
    """→ image_url of a Book whose title really matches, or None."""
    q = f"{title} {author}".strip()
    html = get("https://www.abjjad.com/search?kw=" + urllib.parse.quote(q))
    seen, cands = set(), []
    for path, bid, slug in re.findall(r'href="(/book/(\d+)/([^"/?]+)[^"]*)"', html):
        if bid not in seen:
            seen.add(bid)
            cands.append((path, slug))
    best = next((c for c in cands if norm(c[1]) == norm(title)), None) \
        or next((c for c in cands if close_match(title, c[1])), None)
    if not best:
        return None
    return ld_image(get("https://www.abjjad.com" + best[0]))


def goodreads(title, author, url=None):
    """بحث بالعنوان والمؤلف، وإذا ما طلع إشي بالعنوان لحاله — وبنقبل النتيجة بس إذا عنوانها مطابق."""
    if not url:
        for q in ([f"{title} {author}".strip(), title] if author else [title]):
            ids = list(dict.fromkeys(re.findall(r"book/show/(\d+)", get("https://www.goodreads.com/search?q=" + urllib.parse.quote(q)))))
            if ids:
                url = "https://www.goodreads.com/book/show/" + ids[0]
                break
        if not url:
            return None
        html = get(url)
        m = re.search(r'<meta property="og:title" content="([^"]+)"', html)
        if not m or not close_match(title, re.sub(r"\s*\([^)]*#\d+[^)]*\)\s*$", "", m.group(1))):
            return None
    else:
        html = get(url)
    img = ld_image(html)
    if not img:
        m = re.search(r'<meta property="og:image" content="([^"]+)"', html)
        img = m.group(1) if m else None
    if not img or "nophoto" in img or "gr-assets.com" in img:   # Goodreads' generic placeholder, not a cover
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
    if gr_url:                             # a Goodreads link we already trust (from the sheet) comes first
        try:
            g = goodreads(title, author, gr_url)
            if g:
                yield "goodreads", g
        except Exception as e:
            print("goodreads(url):", e, file=sys.stderr)
    try:
        a = abjjad(title, author)
        if a:
            yield "abjjad", a
    except Exception as e:
        print("abjjad:", e, file=sys.stderr)
    if not gr_url:
        try:
            g = goodreads(title, author)
            if g:
                yield "goodreads", g
        except Exception as e:
            print("goodreads:", e, file=sys.stderr)
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


def clean(raw):
    """raw bytes → cleaned cover (RGB) or None if it isn't a usable cover."""
    img = strip_background(flatten(Image.open(io.BytesIO(raw))))
    return img if usable(img) else None


def find_book(title, author="", gr_url=""):
    """→ (source, url, cleaned cover image, tried) — the raw cover, before the template."""
    tried = []
    for source, url in candidates(title, author, gr_url):
        try:
            img = clean(get(url, binary=True))
        except Exception as e:
            tried.append({"source": source, "url": url, "error": str(e)})
            continue
        if img:
            return source, url, img, tried
        tried.append({"source": source, "url": url, "error": "not a usable cover"})
    return None, None, None, tried


# النسخة النظيفة (مفرّغة من الخلفية وموضّحة، قبل القالب) لآخر الأغلفة — n8n بيطلبها بعد /cover ليحفظها بالدرايف
_CLEAN = {}


def clean_key(title, author=""):
    return norm(title) + "|" + norm(author)


def clean_png(img):
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "PNG", optimize=True)
    return buf.getvalue()


def find_cover(title, author="", gr_url=""):
    source, url, img, tried = find_book(title, author, gr_url)
    if img is None:
        return None, None, None, tried
    clean = enhance(img)
    _CLEAN[clean_key(title, author)] = clean_png(clean)
    while len(_CLEAN) > 30:                      # بس آخر 30 غلاف بالذاكرة
        _CLEAN.pop(next(iter(_CLEAN)))
    return source, url, encode(compose(clean.convert("RGBA"), COVER_SETTINGS), "cover.jpg"), tried


def find_clean(title, author="", gr_url=""):
    """النسخة النظيفة: من الذاكرة إذا انعملت للتو، وإلا بندوّر عليها من جديد."""
    hit = _CLEAN.get(clean_key(title, author))
    if hit:
        return hit
    _, _, img, _ = find_book(title, author, gr_url)
    return clean_png(enhance(img)) if img is not None else None


# ---------------------------------------------------------------- series cover
def drive_id(url):
    m = re.search(r"/d/([A-Za-z0-9_-]{20,})", url or "") or re.search(r"[?&]id=([A-Za-z0-9_-]{20,})", url or "")
    return m.group(1) if m else None


def book_from_store_image(url):
    """
    صور الموقع الحالية كلها بنفس القالب، فبنقارنها بالقالب الفاضي وبنقص الكتاب
    منها بالضبط — هيك بنستخدم نفس الطبعة اللي على الموقع.
    """
    fid = drive_id(url)
    if not fid:
        return None
    img = flatten(Image.open(io.BytesIO(get(f"https://lh3.googleusercontent.com/d/{fid}=w1080", binary=True))))
    W, H = COVER_SETTINGS["size"]
    if abs(img.width / img.height - W / H) > 0.02:
        return clean_from_image(img)          # not one of the template images: treat it as a plain cover
    box = book_box(img)
    if not box:
        return None
    book = img.crop(box)
    return book if usable(book) else None


def book_box(img):
    """
    الكتاب بصور القالب مستطيل حوافه حادة على خلفية ناعمة، فبنلاقي أقوى قفزة لون
    عمودية يمين ويسار النص، وأقوى قفزة أفقية فوق وتحت — بغض النظر عن لون الخلفية.
    """
    g = img.convert("L")
    W, H = g.size
    px = g.load()

    def col_edges(y0, y1, x0, x1):
        prof = []
        for x in range(x0, x1):
            prof.append(sum(abs(px[x, y] - px[x - 1, y]) for y in range(y0, y1, 3)))
        return prof

    def row_edges(x0, x1, y0, y1):
        prof = []
        for y in range(y0, y1):
            prof.append(sum(abs(px[x, y] - px[x, y - 1]) for x in range(x0, x1, 3)))
        return prof

    # the template always centres the book, so its left/right edges are a symmetric pair
    y0, y1 = round(H * 0.25), round(H * 0.75)
    cx = W // 2
    prof = col_edges(y0, y1, 1, W - 1)            # prof[i] ↔ column i+1
    at = lambda x: prof[x - 1] if 1 <= x <= W - 1 else 0
    best_d = max(range(W // 8, W // 2 - 2),
                 key=lambda d: min(at(cx - d), at(cx + d)) + 0.25 * (at(cx - d) + at(cx + d)))
    lx, rx = cx - best_d, cx + best_d
    m = (rx - lx) // 6
    top = row_edges(lx + m, rx - m, 1, round(H * 0.4))
    bot = row_edges(lx + m, rx - m, round(H * 0.6), H - 1)
    ty = 1 + max(range(len(top)), key=top.__getitem__)
    by = round(H * 0.6) + max(range(len(bot)), key=bot.__getitem__)
    # sanity: a real book edge is much stronger than the background's average
    avg = sum(prof) / len(prof)
    if min(at(lx), at(rx)) < avg * 2 or rx - lx < W * 0.25 or by - ty < H * 0.4:
        return None
    return (lx, ty, rx, by)


def clean_from_image(img):
    img = strip_background(img)
    return img if usable(img) else None


def series_group(books):
    """
    الأجزاء متراكبة كدرج: الجزء الأول قدّام ويمين (الموقع عربي، القراءة من اليمين)،
    وكل جزء بعده أصغر بشوي، لورا، لفوق ولليسار — مع ظل ناعم يفصل بينهم.
    """
    H0 = 1000
    n = len(books)
    shrink = 0.9 if n <= 3 else 0.94
    step = {2: 0.34, 3: 0.27, 4: 0.22}.get(n, 0.15)
    rise = 0.035 if n <= 4 else 0.02
    parts = []
    for i, b in enumerate(books):
        h = round(H0 * shrink ** i)
        parts.append(b.resize((round(b.width * h / b.height), h), Image.LANCZOS).convert("RGBA"))
    w0 = parts[0].width
    offs = [round(w0 * step * i) for i in range(n)]          # how far left each part sits
    pad = 40
    cw = w0 + offs[-1] + pad * 2
    canvas = Image.new("RGBA", (cw, H0 + pad * 2), (0, 0, 0, 0))
    for i in reversed(range(n)):           # back to front: part 1 drawn last, on top
        b = parts[i]
        x = cw - pad - w0 - offs[i]
        y = pad + H0 - b.height - round(H0 * rise * i)
        sh = Image.new("L", canvas.size, 0)
        sh.paste(255, (x + 14, y + 8, x + b.width + 14, y + b.height + 8))
        sh = sh.filter(ImageFilter.GaussianBlur(16)).point(lambda v: int(v * 0.38))
        shadow = Image.new("RGBA", canvas.size, (20, 22, 50, 0))
        shadow.putalpha(sh)
        canvas = Image.alpha_composite(canvas, shadow)
        layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        layer.paste(b, (x, y))
        canvas = Image.alpha_composite(canvas, layer)
    return canvas


def series_cover(members):
    """members: [{title, author, cover}] in part order → (jpeg bytes, per-part sources)."""
    books, sources = [], []
    for m in members:
        img, src = None, None
        try:
            img = book_from_store_image(m.get("cover"))
            src = "store" if img else None
        except Exception as e:
            print("store image:", e, file=sys.stderr)
        if img is None:
            s, _, img, _ = find_book(str(m.get("title") or ""), str(m.get("author") or ""))
            src = s
        if img is None:
            return None, sources + [{"title": m.get("title"), "source": None}]
        books.append(enhance(img))
        sources.append({"title": m.get("title"), "source": src})
    settings = {**COVER_SETTINGS, "book_size": 78, "shadow": False}
    return encode(compose(series_group(books), settings), "series.jpg"), sources


# ---------------------------------------------------------------- ratings
def rating_of(url):
    html = get(url)
    for block in re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', html):
        try:
            obj = json.loads(block)
        except ValueError:
            continue
        nodes = obj if isinstance(obj, list) else [obj]
        nodes = [g for o in nodes for g in ([o] + (o.get("@graph") or [] if isinstance(o, dict) else []))]
        for o in nodes:
            ar = o.get("aggregateRating") if isinstance(o, dict) else None
            if ar and ar.get("ratingValue"):
                return float(ar["ratingValue"]), int(float(ar.get("ratingCount") or ar.get("reviewCount") or 0))
    return None


def ratings(items, delay=4, retry_delay=12):
    """
    واحد واحد بهدوء. جودريدز أحياناً بيرجّع صفحة بدون بيانات لما نكثّر عليه،
    فاللي بيفشل بنعيده مرة تانية بالآخر بفاصل أطول.
    """
    out = []

    def one(it):
        url = str(it.get("url") or "").strip()
        res = {"id": it.get("id"), "url": url}
        if url.startswith("http"):
            try:
                r = rating_of(url)
                if r:
                    res["rating"], res["count"] = r
            except Exception as e:
                res["error"] = str(e)
        return res

    for i, it in enumerate(items):
        out.append(one(it))
        if i < len(items) - 1:
            time.sleep(delay)
    failed = [i for i, r in enumerate(out) if "rating" not in r and r["url"].startswith("http")]
    for n, i in enumerate(failed):
        time.sleep(retry_delay)
        out[i] = one(items[i])
    print(f"[ratings] {len(items)} books, {len(failed)} retried, "
          f"{sum(1 for r in out if 'rating' in r)} with ratings", file=sys.stderr)
    return out


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

    def _read(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def _jpeg(self, out, headers):
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(out)))
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(out)

    def do_POST(self):
        try:
            req = self._read()
        except ValueError:
            return self._json(400, {"error": "bad json"})
        if self.path == "/cover":
            return self.cover(req)
        if self.path == "/cover-clean":
            return self.cover_clean(req)
        if self.path == "/series-cover":
            return self.series(req)
        if self.path == "/ratings":
            return self._json(200, {"items": ratings(req.get("items") or [])})
        self._json(404, {"error": "not found"})

    def cover(self, req):
        title = str(req.get("title") or "").strip()
        if not title:
            return self._json(400, {"error": "title is required"})
        source, url, out, tried = find_cover(title, str(req.get("author") or "").strip(),
                                             str(req.get("goodreadsUrl") or "").strip())
        print(f"[cover] {title!r} → {source or 'NOT FOUND'} {url or ''}", file=sys.stderr)
        if not out:
            return self._json(404, {"found": False, "tried": tried})
        # header values must be latin-1: the source URL is ASCII, the title isn't sent back
        self._jpeg(out, {"X-Cover-Source": source, "X-Cover-Url": url})

    def cover_clean(self, req):
        title = str(req.get("title") or "").strip()
        if not title:
            return self._json(400, {"error": "title is required"})
        out = find_clean(title, str(req.get("author") or "").strip(), str(req.get("goodreadsUrl") or "").strip())
        print(f"[clean] {title!r} → {'OK' if out else 'NOT FOUND'}", file=sys.stderr)
        if not out:
            return self._json(404, {"found": False})
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def series(self, req):
        members = req.get("members") or []
        if len(members) < 2:
            return self._json(400, {"error": "need at least 2 members"})
        out, sources = series_cover(members[:8])
        print(f"[series] {len(members)} parts → {'OK' if out else 'FAILED'} {sources}", file=sys.stderr)
        if not out:
            return self._json(404, {"found": False, "parts": sources})
        self._jpeg(out, {"X-Parts": json.dumps(sources, ensure_ascii=True)})

if __name__ == "__main__":
    if len(sys.argv) > 1:  # CLI test: python app.py "اسم الكتاب" ["المؤلف"] > out.jpg
        s, u, out, tried = find_cover(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "")
        print(s, u, tried, file=sys.stderr)
        if out:
            sys.stdout.buffer.write(out)
        sys.exit(0 if out else 1)
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
