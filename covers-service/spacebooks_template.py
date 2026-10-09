#!/usr/bin/env python3
"""
SPACEBOOKs book image template (batch script)

Puts every cut-out book image into one unified product-image template.
File names and folder structure stay exactly as they were.

Requires:  pip install pillow

Usage:
  python spacebooks_template.py  INPUT  OUTPUT

  INPUT   a folder of images, or a ZIP downloaded from Google Drive
  OUTPUT  a new folder (or a .zip name when the input is a ZIP)

Examples:
  python spacebooks_template.py "صور أغلفة الكتب" "صور المتجر"
  python spacebooks_template.py drive-download.zip store-images.zip
"""

import io
import math
import os
import sys
import zipfile

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

# =====================================================================
#  Settings: same as the buttons in the web tool
#  (defaults = the settings in the screenshots)
# =====================================================================
SETTINGS = {
    "size": (1080, 1350),     # (1000,1000) | (1080,1350) | (1200,1200)
    "style": "studio",        # "brand" | "studio" | "shelf" | "solid"
    "color": "#F6F4F0",       # background color (ignored for "brand"):
                              # "#F6F4F0" "#FFFFFF" "#E9E5DF" "#1D1E4E" "#4B3F72" "#0B1020"
    "angle": 150,             # gradient direction, "brand" only: 150 | 180 | 210
    "brightness": 0,          # -1 darker | 0 normal | 1 lighter
    "glow": 1,                # cyan glow: 0 none | 1 light | 2 strong
    "glass": "off",           # "off" | "clear" | "frost"
    "book_size": 72,          # 64 small | 72 medium | 78 large | 86 larger
    "stars": True,
    "ring": True,
    "shadow": True,
    "reflect": False,
    "caption": "",            # optional small text at the bottom, e.g. "SPACEBOOKs"
    "caption_font": "",       # path to a .ttf (e.g. ReadexPro-Medium.ttf), needed for Arabic captions
    "logo": "",               # optional path to the logo PNG
}

NAVY, PURPLE, CYAN, YELLOW = "#1D1E4E", "#4B3F72", "#06B6D4", "#FFD166"
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp")
SS = 3  # supersampling for smooth stars and ring


# ---------------------------------------------------------------- helpers
def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(h, amt):
    return tuple(max(0, min(255, round(v + amt * 255))) for v in rgb(h))


def is_dark(h):
    r, g, b = rgb(h)
    return (r * 299 + g * 587 + b * 114) / 1000 < 110


def solid(size, color, alpha=255):
    return Image.new("RGBA", size, (*color, alpha) if isinstance(color, tuple) else (*rgb(color), alpha))


def radial_mask(size, cx, cy, rx, ry=None):
    """L mask: 0 at the center, 255 at radius and beyond (like a canvas radial gradient)."""
    ry = ry or rx
    W, H = size
    out = Image.new("L", size, 255)
    # Pillow's gradient is 181 (not 255) at radius 128, so stretch it to reach 255 at the radius
    g = Image.radial_gradient("L").point(lambda v: min(255, round(v * 255 / 181)))
    g = g.resize((max(1, round(rx * 2)), max(1, round(ry * 2))), Image.BILINEAR)
    out.paste(g, (round(cx - rx), round(cy - ry)))
    return out


def linear_mask(size, angle):
    """L mask for a CSS/canvas-style linear gradient at `angle` degrees."""
    W, H = size
    a = math.radians(angle)
    dx, dy = math.sin(a), -math.cos(a)
    half = (abs(W * dx) + abs(H * dy)) / 2
    S = math.ceil(math.hypot(W, H)) + 4
    g = Image.linear_gradient("L").resize((S, max(2, round(half * 2))), Image.BILINEAR)
    big = Image.new("L", (S, S), 0)
    top = (S - g.height) // 2
    big.paste(g, (0, top))
    big.paste(255, (0, top + g.height, S, S))
    big = big.rotate(180 - angle, resample=Image.BILINEAR)
    l, t = (S - W) // 2, (S - H) // 2
    return big.crop((l, t, l + W, t + H))


def gradient(size, mask, c0, c1):
    return Image.composite(solid(size, c1), solid(size, c0), mask)


def overlay(base, color, mask_or_alpha):
    """Composite a color over base using an L mask (or a single alpha 0-255)."""
    layer = solid(base.size, color, 0)
    if isinstance(mask_or_alpha, Image.Image):
        layer.putalpha(mask_or_alpha)
    else:
        layer.putalpha(int(mask_or_alpha))
    return Image.alpha_composite(base, layer)


def scaled(mask, k):
    return mask.point(lambda v: int(v * k))


def trim(img):
    img = img.convert("RGBA")
    bbox = img.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
    return img.crop(bbox) if bbox else img


def rounded_mask(size, box, r):
    m = Image.new("L", (size[0] * SS, size[1] * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle([v * SS for v in box], radius=r * SS, fill=255)
    return m.resize(size, Image.LANCZOS)


# ---------------------------------------------------------------- motifs
def star_points(cx, cy, r, steps=14):
    k = r * 0.16
    tips = [(cx, cy - r), (cx + r * 0.78, cy), (cx, cy + r), (cx - r * 0.78, cy)]
    ctrl = [(cx + k, cy - k), (cx + k, cy + k), (cx - k, cy + k), (cx - k, cy - k)]
    pts = []
    for i in range(4):
        p0, p1, c = tips[i], tips[(i + 1) % 4], ctrl[i]
        for s in range(steps):
            t = s / steps
            pts.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
                        (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]))
    return pts


def draw_motifs(base, dark, s):
    W, H = base.size
    big = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    soft = (255, 255, 255, 140) if dark else (*rgb(PURPLE), 89)

    if s["ring"]:
        rx, ry, rot = W * 0.47, H * 0.15, -0.22
        pts = []
        for i in range(161):
            t = math.pi * 1.05 + (math.pi * 0.9) * i / 160
            x, y = rx * math.cos(t), ry * math.sin(t)
            pts.append(((W / 2 + x * math.cos(rot) - y * math.sin(rot)) * SS,
                        (H / 2 + x * math.sin(rot) + y * math.cos(rot)) * SS))
        d.line(pts, fill=(*rgb(CYAN), 115 if dark else 89), width=round(max(2, W * 0.003) * SS), joint="curve")

    glow_layer = None
    if s["stars"]:
        main = (*rgb(YELLOW if dark else NAVY), 255)
        sp = [(p[0] * SS, p[1] * SS) for p in star_points(W * 0.15, H * 0.17, W * 0.03)]
        d.polygon(sp, fill=main)
        if dark:  # soft glow around the main star
            glow_layer = Image.new("RGBA", big.size, (0, 0, 0, 0))
            ImageDraw.Draw(glow_layer).polygon(sp, fill=main)
            glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(W * 0.03 * SS * 0.6))
        d.polygon([(p[0] * SS, p[1] * SS) for p in star_points(W * 0.84, H * 0.74, W * 0.014)],
                  fill=(159, 230, 242, 204) if dark else soft)
        for px, py, pr in [(.24, .25, .0035), (.09, .42, .0025), (.30, .09, .002),
                           (.88, .58, .0028), (.72, .86, .002), (.12, .80, .0022)]:
            cx, cy, r = W * px * SS, H * py * SS, W * pr * SS
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=soft)

    if glow_layer:
        base = Image.alpha_composite(base, glow_layer.resize((W, H), Image.LANCZOS))
    return Image.alpha_composite(base, big.resize((W, H), Image.LANCZOS))


# ---------------------------------------------------------------- glass
def draw_glass(base, dark, base_y, bh, s):
    W, H = base.size
    frost = s["glass"] == "frost"
    pw, ph = W * 0.76, min(H * 0.86, bh + H * 0.16)
    X, Y, r = (W - pw) / 2, max(H * 0.05, base_y - bh - H * 0.08), W * 0.045
    box = (X, Y, X + pw, Y + ph)
    mask = rounded_mask((W, H), box, r)

    # navy shadow under the pane
    sh = mask.filter(ImageFilter.GaussianBlur(W * 0.025))
    sh = ImageChops.offset(sh, 0, round(W * 0.02))
    base = overlay(base, (5, 7, 20) if dark else rgb(NAVY), scaled(sh, 0.45 if dark else 0.18))

    blurred = base.filter(ImageFilter.GaussianBlur(W * (0.012 if frost else 0.005)))
    a = (0.16 if frost else 0.08) if dark else (0.5 if frost else 0.28)
    tint = linear_mask((W, H), 135).point(lambda v: int(255 * ((a + 0.06) - 0.12 * v / 255)))
    pane = overlay(blurred, (255, 255, 255), tint)
    base = Image.composite(pane, base, mask)

    # light edge, brighter at the top
    lw = max(1.5, W * 0.0022)
    ring = Image.new("L", (W * SS, H * SS), 0)
    ImageDraw.Draw(ring).rounded_rectangle([v * SS for v in box], radius=r * SS, outline=255, width=round(lw * SS))
    ring = ring.resize((W, H), Image.LANCZOS)
    fade = linear_mask((W, H), 180).point(lambda v: int(255 * (0.55 - 0.43 * v / 255)))
    return overlay(base, (255, 255, 255), ImageChops.multiply(ring, fade))


# ---------------------------------------------------------------- compose
def compose(book, s=SETTINGS, logo=None):
    W, H = s["size"]
    style = s["style"]
    col = NAVY if style == "brand" else s["color"]
    dark = is_dark(col)

    # background
    if style == "brand":
        img = gradient((W, H), linear_mask((W, H), s["angle"]), rgb(NAVY), rgb(PURPLE))
    elif style == "solid":
        img = solid((W, H), col)
    elif style == "studio":
        m = radial_mask((W, H), W / 2, H * 0.42, max(W, H) * 0.75)
        img = gradient((W, H), m, shade(col, 0.08 if dark else 0.05), shade(col, -0.04 if dark else -0.07))
    else:  # shelf
        img = solid((W, H), col)
        fy = round(H * 0.84)
        floor = gradient((W, H - fy), linear_mask((W, H - fy), 180),
                         shade(col, 0.06 if dark else -0.06), shade(col, 0.02 if dark else -0.12))
        img.paste(floor, (0, fy))
        ImageDraw.Draw(img).rectangle([0, fy, W, fy + max(2, round(H * 0.004))], fill=shade(col, 0.12 if dark else -0.16))

    if s["brightness"] > 0:
        img = overlay(img, (255, 255, 255), 0.09 * 255)
    elif s["brightness"] < 0:
        img = overlay(img, (11, 16, 32), 0.16 * 255)

    if s["glow"]:
        al = [0, 0.36 if dark else 0.2, 0.6 if dark else 0.34][s["glow"]]
        m = radial_mask((W, H), W / 2, H * 1.05, H * (0.75 if s["glow"] == 2 else 0.6))
        img = overlay(img, rgb(CYAN), m.point(lambda v: int(al * (255 - v))))

    img = draw_motifs(img, dark, s)

    # fit the book: same height for every book, capped by width
    cap_h = 0.08 if s["caption"] else 0
    scale = s["book_size"]
    base_y = H * 0.84 if style == "shelf" else H * (0.5 + scale / 200 - cap_h / 2)
    bh = H * scale / 100 * (0.92 if style == "shelf" else 1) - H * cap_h
    bw = bh * book.width / book.height
    if bw > W * 0.86:
        bw = W * 0.86
        bh = bw * book.height / book.width
    bx, by = (W - bw) / 2, base_y - bh
    b = book.resize((max(1, round(bw)), max(1, round(bh))), Image.LANCZOS)
    pos = (round(bx), round(by))

    if s["glass"] != "off":
        img = draw_glass(img, dark, base_y, bh, s)

    if s["shadow"]:
        # contact shadow: flat ellipse at the base
        rx = bw * 0.62
        m = radial_mask((W, H), W / 2, base_y, rx, rx * 0.09)
        img = overlay(img, (5, 7, 20) if dark else rgb(NAVY), m.point(lambda v: int((0.6 if dark else 0.30) * (255 - v))))
        # drop shadow of the book itself
        a = Image.new("L", (W, H), 0)
        a.paste(b.getchannel("A"), (round(bx - W * 0.012), round(by + W * 0.014)))
        a = a.filter(ImageFilter.GaussianBlur(W * 0.015))
        img = overlay(img, (5, 7, 20) if dark else rgb(NAVY), scaled(a, 0.55 if dark else 0.26))

    if s["reflect"]:
        rh = max(1, round(bh * 0.22))
        flip = b.transpose(Image.FLIP_TOP_BOTTOM).crop((0, 0, b.width, rh))
        fade = Image.linear_gradient("L").resize((b.width, rh)).point(lambda v: int(0.22 * (255 - v)))
        flip.putalpha(ImageChops.multiply(flip.getchannel("A"), fade))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.paste(flip, (round(bx), round(base_y) + 1))
        img = Image.alpha_composite(img, layer)

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(b, pos)
    img = Image.alpha_composite(img, layer)

    if s["caption"]:
        size = round(W * 0.03)
        try:
            font = ImageFont.truetype(s["caption_font"], size) if s["caption_font"] else ImageFont.load_default(size)
        except OSError:
            font = ImageFont.load_default(size)
        d = ImageDraw.Draw(img)
        d.text((W / 2, H - H * 0.045), s["caption"], font=font, anchor="ms",
               fill=(255, 255, 255, 217) if dark else (*rgb(NAVY), 255))

    if logo is not None:
        box, m = W * 0.13, W * 0.05
        k = min(box / logo.width, box / logo.height)
        lg = logo.resize((max(1, round(logo.width * k)), max(1, round(logo.height * k))), Image.LANCZOS)
        cx, cy = W - m - box / 2, m + box / 2
        if dark:  # brand guide: logo sits in a light circle on dark backgrounds
            rr = box * 0.68
            c = Image.new("L", (W, H), 0)
            ImageDraw.Draw(c).ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=255)
            img = overlay(img, (5, 7, 20), scaled(c.filter(ImageFilter.GaussianBlur(W * 0.01)), 0.35))
            img = overlay(img, rgb("#F6F4F0"), c)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.paste(lg, (round(cx - lg.width / 2), round(cy - lg.height / 2)))
        img = Image.alpha_composite(img, layer)

    return img


# ---------------------------------------------------------------- I/O
def encode(img, name):
    """Encode in the same format as the original file name."""
    ext = os.path.splitext(name)[1].lower()
    buf = io.BytesIO()
    if ext in (".jpg", ".jpeg"):
        img.convert("RGB").save(buf, "JPEG", quality=95, subsampling=0)
    elif ext == ".webp":
        img.convert("RGB").save(buf, "WEBP", quality=95)
    else:
        img.convert("RGB").save(buf, "PNG", optimize=True)
    return buf.getvalue()


def process(data, name, logo):
    book = trim(Image.open(io.BytesIO(data)))
    return encode(compose(book, SETTINGS, logo), name)


def render_book_image(image_bytes, filename, settings=None, logo_path=None):
    """
    For website integration: take one uploaded cut-out book image and return
    the finished product image as bytes, in the same format as `filename`.
    Save the result under the same filename.

        from spacebooks_template import render_book_image
        out = render_book_image(open("book.png", "rb").read(), "book.png")
    """
    s = {**SETTINGS, **(settings or {})}
    logo = trim(Image.open(logo_path)) if logo_path else None
    book = trim(Image.open(io.BytesIO(image_bytes)))
    return encode(compose(book, s, logo), filename)


def is_image(path):
    base = os.path.basename(path)
    return path.lower().endswith(IMAGE_EXT) and not base.startswith(".") and "__MACOSX" not in path


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    if os.path.abspath(src) == os.path.abspath(dst):
        sys.exit("The output must be different from the input, so the originals are never overwritten.")
    logo = trim(Image.open(SETTINGS["logo"])) if SETTINGS["logo"] else None
    done = failed = 0

    if zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as zin:
            names = [n for n in zin.namelist() if not n.endswith("/") and is_image(n)]
            out_zip = dst.lower().endswith(".zip")
            zout = zipfile.ZipFile(dst, "w", zipfile.ZIP_STORED) if out_zip else None
            for i, n in enumerate(names, 1):
                print(f"[{i}/{len(names)}] {n}")
                try:
                    out = process(zin.read(n), n, logo)
                except Exception as e:  # keep going; report at the end
                    print(f"   ! skipped: {e}")
                    failed += 1
                    continue
                if zout:
                    zout.writestr(zipfile.ZipInfo(n, date_time=zin.getinfo(n).date_time), out)
                else:
                    path = os.path.join(dst, n)
                    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
                    with open(path, "wb") as f:
                        f.write(out)
                done += 1
            if zout:
                zout.close()
    else:
        files = []
        for root, _, fs in os.walk(src):
            files += [os.path.join(root, f) for f in sorted(fs) if is_image(os.path.join(root, f))]
        for i, path in enumerate(files, 1):
            rel = os.path.relpath(path, src)
            print(f"[{i}/{len(files)}] {rel}")
            try:
                with open(path, "rb") as f:
                    out = process(f.read(), rel, logo)
            except Exception as e:
                print(f"   ! skipped: {e}")
                failed += 1
                continue
            target = os.path.join(dst, rel)  # same name, same sub-folder
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "wb") as f:
                f.write(out)
            done += 1

    print(f"\nDone: {done} images" + (f" · {failed} could not be opened" if failed else "") + f"\n→ {dst}")


if __name__ == "__main__":
    main()
