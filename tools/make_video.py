"""Builds the ≤60s demo video from real screenshots of the live Reddit post."""
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CAP = ROOT / "docs" / "captures"
TMP = Path("/tmp/opencode/video")
TMP.mkdir(parents=True, exist_ok=True)

W, H = 1280, 720
CAPH = 108
PLUM = (42, 30, 63)
AMBER = (255, 184, 77)
PARCHMENT = (242, 236, 223)
TEAL = (82, 214, 200)

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
try:
    title_font = ImageFont.truetype(FONT, 34)
    sub_font = ImageFont.truetype(FONT, 22)
except OSError:
    title_font = sub_font = ImageFont.load_default()

# (source, seconds, title, subtitle)
SLIDES = [
    ("01-feed.png", 8, "SLOG", "Every day, all of Reddit steers one brave snail."),
    ("02-game.png", 12, "ONE SHARED BOARD", "One hero. One move per person per day."),
    ("03-practice.png", 9, "TRAINING TUNNELS", "Unlimited solo practice — the whole game, zero stakes."),
    ("04-practice-move.png", 9, "A CLEAR RESULT", "Every session ends with a card and a streak."),
    ("05-daily-posts.png", 9, "A NEW FLOOR DAILY", "Fresh arena post every day at 12:00 UTC."),
]
total = sum(s[1] for s in SLIDES) + 6
assert total <= 60, total

paths = []
for i, (src, seconds, title, subtitle) in enumerate(SLIDES):
    frame = Image.new("RGB", (W, H), PLUM)
    shot = Image.open(CAP / src).convert("RGB")
    avail_h = H - CAPH
    scale = min(W / shot.width, avail_h / shot.height)
    shot = shot.resize((int(shot.width * scale), int(shot.height * scale)))
    frame.paste(shot, ((W - shot.width) // 2, (avail_h - shot.height) // 2))
    d = ImageDraw.Draw(frame)
    d.rectangle([0, H - CAPH, W, H], fill=PLUM)
    d.rectangle([0, H - CAPH, W, H - CAPH + 4], fill=AMBER)
    d.text((36, H - CAPH + 14), title, font=title_font, fill=AMBER)
    d.text((36, H - CAPH + 60), subtitle, font=sub_font, fill=PARCHMENT)
    out = TMP / f"slide{i}.png"
    frame.save(out)
    paths.append((out, seconds))

# proof end card (no photo needed)
end = Image.new("RGB", (W, H), PLUM)
d = ImageDraw.Draw(end)
for r in range(380, 0, -8):
    d.ellipse([640 - r, 300 - r, 640 + r, 300 + r], outline=(59, 42, 86), width=4)
d.text((220, 215), "PROVE IT YOURSELF", font=title_font, fill=AMBER)
d.text((220, 285), "Open the post. Spend your one move.", font=sub_font, fill=PARCHMENT)
d.text((220, 330), "Your username enters the shared move log.", font=sub_font, fill=TEAL)
d.text((220, 400), "reddit.com/r/slogslogslog_dev", font=sub_font, fill=AMBER)
end_path = TMP / "slide_end.png"
end.save(end_path)
paths.append((end_path, 6))

# static concat with fade-in/out via ffmpeg's xfade would be overkill — simple
# repeated-frame timeline with a 0.6s crossfade between slides.
inputs = []
for image, _ in paths:
    inputs += ["-loop", "1", "-t", "1", "-i", str(image)]
cmd = ["ffmpeg", "-y"]
for image, seconds in paths:
    cmd += ["-loop", "1", "-t", str(seconds), "-i", str(image)]
filter_parts = []
offset = 0
for i, (_, seconds) in enumerate(paths):
    if i == 0:
        filter_parts.append(f"[{i}:v]trim=duration={seconds},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.4[v{i}]")
    else:
        filter_parts.append(
            f"[{i}:v]trim=duration={seconds},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.4[v{i}]"
        )
    offset += seconds
# concat (hard cuts with short fades — reliable and within 60s)
n = len(paths)
concat = "".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[out]"
cmd += ["-filter_complex", ";".join(filter_parts + [concat]), "-map", "[out]",
        "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23",
        str(ROOT / "docs" / "demo.mp4")]
subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
print(f"built docs/demo.mp4 ({total}s)")
