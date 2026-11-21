"""Generates Slog's identity PNGs. No external assets — all drawn in code."""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "public"
DOCS = ROOT / "docs"
PUB.mkdir(exist_ok=True)
DOCS.mkdir(exist_ok=True)

PLUM = (42, 30, 63)
PLUM_MID = (59, 42, 86)
AMBER = (255, 184, 77)
INK = (36, 27, 53)
TEAL = (82, 214, 200)
PARCHMENT = (242, 236, 223)


def spiral(draw, cx, cy, radius, width, color, turns=2.3):
    points = []
    steps = int(turns * 90)
    for i in range(steps + 1):
        a = -math.pi / 2 + (i / steps) * turns * 2 * math.pi
        r = radius * (1 - 0.9 * (i / steps))
        points.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    draw.line(points, fill=color, width=width, joint="curve")


def favicon(size, path):
    img = Image.new("RGBA", (size, size), PLUM + (255,))
    d = ImageDraw.Draw(img)
    s = size / 64
    d.ellipse([6 * s, 8 * s, 58 * s, 60 * s], fill=AMBER + (255,))
    spiral(d, 32 * s, 34 * s, 20 * s, max(2, int(4 * s)), INK + (255,))
    d.ellipse([45 * s, 10 * s, 55 * s, 20 * s], fill=TEAL + (255,))
    d.ellipse([48 * s, 13 * s, 52 * s, 17 * s], fill=INK + (255,))
    img.save(path)


for sz in (16, 32, 180):
    favicon(sz, PUB / f"favicon-{sz}.png")

# 1280x720 project thumbnail for Devpost
W, H = 1280, 720
thumb = Image.new("RGB", (W, H), PLUM)
d = ImageDraw.Draw(thumb)
for r in range(420, 0, -6):
    alpha = int(22 * (1 - r / 420))
    d.ellipse([330 - r, 300 - r, 330 + r, 300 + r], outline=tuple(min(255, c + alpha) for c in PLUM_MID), width=4)
d.ellipse([165, 165, 495, 495], fill=AMBER)
spiral(d, 330, 330, 118, 22, INK, turns=2.35)
d.ellipse([452, 182, 506, 236], fill=TEAL)
d.ellipse([468, 198, 490, 220], fill=INK)

font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
try:
    big = ImageFont.truetype(font_path, 118)
    mid = ImageFont.truetype(font_path, 34)
    small = ImageFont.truetype(font_path, 25)
except OSError:
    big = mid = small = ImageFont.load_default()
d.text((575, 240), "SLOG", font=big, fill=AMBER)
d.text((580, 380), "One brave snail. One shared dungeon.", font=mid, fill=PARCHMENT)
d.text((580, 432), "All of Reddit steers the hero — one move each.", font=small, fill=TEAL)
d.text((580, 476), "A daily game built on Reddit's Devvit platform.", font=small, fill=PARCHMENT)
d.text((580, 552), "New floor every day at 12:00 UTC", font=small, fill=AMBER)
thumb.save(DOCS / "thumbnail.png")
print("generated favicons +", DOCS / "thumbnail.png")
