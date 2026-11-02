# -*- coding: utf-8 -*-
"""生成 440x140 中国小型汽车蓝牌贴图（albedo + normal），按 GA36 版面尺寸：
字符 45x90mm、字符间距 12mm、第2/3字符间 34mm（含分隔点）、白框线 3.4mm。
字体：platechar.ttf（车牌专用英数字）+ platech.ttf（中文）。
底色取样自 zheng-yuwei/license-plate-generator 的 single_blue1.bmp。
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

MM = 5.0
W, H = int(440 * MM), int(140 * MM)          # 2200 x 700
PLATE_NO = sys.argv[1] if len(sys.argv) > 1 else "蒙AZ8M68"

CELL = int(45 * MM)                            # 225
GAP = int(12 * MM)                             # 60
BIG_GAP = int(34 * MM)                         # 170  (2/3 字符之间)
CHAR_H = int(90 * MM)                          # 450
DOT_D = int(10 * MM)                           # 50

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_EN = os.path.join(HERE, "zd", "platechar.ttf")
FONT_CN = r"C:\Windows\Fonts\simhei.ttf"

TOP_BLUE = (8, 10, 118)
BOT_BLUE = (3, 3, 86)
WHITE = (250, 250, 247)


def ink_bbox(img):
    a = np.array(img)
    ys, xs = np.nonzero(a > 24)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def glyph(ch, font_path):
    size = 760
    f = ImageFont.truetype(font_path, size)
    im = Image.new("L", (size * 3, size * 3), 0)
    ImageDraw.Draw(im).text((size, size // 2), ch, 255, font=f)
    return im.crop(ink_bbox(im))


def fit_glyph(ch):
    """字高 90mm；字母数字保持原比例（'1' 不能被拉宽），过宽的字母压到字格宽；
    汉字按车牌惯例压成 45x90mm。"""
    if ch == PLATE_NO[0]:
        g = glyph(ch, FONT_CN)
        return g.resize((CELL, CHAR_H), Image.LANCZOS)
    g = glyph(ch, FONT_EN)
    w = max(1, round(g.width * CHAR_H / g.height))
    g = g.resize((w, CHAR_H), Image.LANCZOS)
    if w > CELL * 1.04:
        g = g.resize((round(CELL * 1.04), CHAR_H), Image.LANCZOS)
    return g


def make_text_mask():
    mask = Image.new("L", (W, H), 0)
    total = CELL * 7 + GAP * 5 + BIG_GAP
    x0 = (W - total) // 2
    y0 = (H - CHAR_H) // 2

    cx = x0
    for i, ch in enumerate(PLATE_NO):
        g = fit_glyph(ch)
        mask.paste(g, (cx + (CELL - g.width) // 2, y0), g)
        cx += CELL + (BIG_GAP if i == 1 else GAP)

    dot_cx = x0 + CELL * 2 + GAP + BIG_GAP // 2
    d = Image.new("L", (W, H), 0)
    ImageDraw.Draw(d).ellipse(
        (dot_cx - DOT_D // 2, H // 2 - DOT_D // 2,
         dot_cx + DOT_D // 2, H // 2 + DOT_D // 2), fill=255)
    return Image.fromarray(np.maximum(np.array(mask), np.array(d)))


def make_border_mask():
    m = Image.new("L", (W, H), 0)
    inset = int(3.4 * MM)
    ImageDraw.Draw(m).rounded_rectangle(
        (inset, inset, W - 1 - inset, H - 1 - inset),
        radius=int(6 * MM), outline=255, width=int(3.4 * MM))
    return m


def make_albedo(t, b):
    y = np.linspace(0, 1, H)[:, None, None]
    base = np.repeat(
        np.array(TOP_BLUE, float)[None, None, :] * (1 - y) + np.array(BOT_BLUE, float)[None, None, :] * y,
        W, axis=1)
    rng = np.random.default_rng(7)
    base = np.clip(base + rng.normal(0, 1.6, (H, W, 1)), 0, 255)

    # 冲压折边处的一圈浅暗边
    ring = np.array(Image.fromarray((t * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)), float) / 255.0
    base *= (1.0 - 0.10 * np.clip(ring - t, 0, 1))[..., None]

    white = np.array(WHITE, float)[None, None, :]
    base = base * (1 - t[..., None]) + white * t[..., None]
    base = base * (1 - b[..., None]) + (white * 0.97) * b[..., None]
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


def bevel(mask, height_mm, radius):
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    h = np.array(m, float) / 255.0
    h = np.clip((h - 0.5) * 2.4 + 0.5, 0, 1)
    return h * height_mm


def make_normal(t, b):
    h = bevel(t, 0.75, 3.2) + bevel(b, 0.45, 1.8)
    yy, xx = np.mgrid[0:H, 0:W]
    h = h + np.sin(xx / 260.0) * np.cos(yy / 210.0) * 0.02

    gy, gx = np.gradient(h)
    nx, ny, nz = -gx * MM, -gy * MM, np.ones_like(h)
    ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    nx, ny, nz = nx / ln, ny / ln, nz / ln
    rgb = np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5], axis=-1)
    return Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8))


def main():
    t = np.array(make_text_mask(), float) / 255.0
    b = np.array(make_border_mask(), float) / 255.0
    albedo = make_albedo(t, b)
    normal = make_normal(t, b)
    out = os.path.join(HERE, "zd", "out")
    os.makedirs(out, exist_ok=True)
    albedo.save(os.path.join(out, "cn_plate_face.png"))
    albedo.resize((1100, 350), Image.LANCZOS).save(os.path.join(out, "preview_face.png"))
    normal.save(os.path.join(out, "cn_plate_normal.png"))
    normal.resize((1100, 350), Image.LANCZOS).save(os.path.join(out, "preview_normal.png"))
    print("ok", albedo.size)


if __name__ == "__main__":
    main()
