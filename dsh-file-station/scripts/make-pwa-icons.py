"""生成 PWA 图标（192/512/apple-touch 180），设计与 icon.svg 一致。"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pwa")
S = 1024          # 先画大图再缩，边缘更干净
SCALE = S / 64.0  # icon.svg 的 viewBox 是 64
SW = 2.4 * SCALE  # 线宽


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def base():
    img = Image.new("RGB", (S, S))
    top, bottom = (0x2F, 0x6F, 0xD0), (0x17, 0x32, 0x4F)
    px = img.load()
    for y in range(S):
        c = lerp(top, bottom, y / (S - 1))
        for x in range(S):
            px[x, y] = c
    return img


def glyph(img):
    d = ImageDraw.Draw(img)
    w = int(round(SW))
    # 显示器
    d.rounded_rectangle([9 * SCALE, 16 * SCALE, 35 * SCALE, 35 * SCALE], radius=2.6 * SCALE, outline="white", width=w)
    # 显示器底座
    d.line([18 * SCALE, 35 * SCALE, 18 * SCALE, 39 * SCALE], fill="white", width=w)
    d.line([32 * SCALE, 35 * SCALE, 32 * SCALE, 39 * SCALE], fill="white", width=w)
    d.line([15 * SCALE, 39 * SCALE, 29 * SCALE, 39 * SCALE], fill="white", width=w)
    # 手机
    d.rounded_rectangle([35 * SCALE, 19 * SCALE, 53 * SCALE, 46 * SCALE], radius=3.4 * SCALE, outline="white", width=w)
    d.line([41 * SCALE, 42 * SCALE, 47 * SCALE, 42 * SCALE], fill="white", width=w)
    # 左箭头
    d.line([28.5 * SCALE, 24.5 * SCALE, 19.5 * SCALE, 24.5 * SCALE], fill="white", width=w)
    d.line([24 * SCALE, 21.5 * SCALE, 20.8 * SCALE, 24.5 * SCALE], fill="white", width=w)
    d.line([24 * SCALE, 27.5 * SCALE, 20.8 * SCALE, 24.5 * SCALE], fill="white", width=w)
    # 右箭头
    d.line([36.5 * SCALE, 31.5 * SCALE, 44.5 * SCALE, 31.5 * SCALE], fill="white", width=w)
    d.line([40.5 * SCALE, 28.5 * SCALE, 43.7 * SCALE, 31.5 * SCALE], fill="white", width=w)
    d.line([40.5 * SCALE, 34.5 * SCALE, 43.7 * SCALE, 31.5 * SCALE], fill="white", width=w)


def main():
    os.makedirs(OUT, exist_ok=True)
    img = base()
    glyph(img)
    for name, size in (("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)):
        img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), "PNG", optimize=True)
        print("wrote", name, size)


if __name__ == "__main__":
    main()
