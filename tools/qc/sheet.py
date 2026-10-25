"""Contact sheet of every shot with a prefix: python3 tools/qc/sheet.py PREFIX OUT.jpg [shots folder]."""
import glob, os, sys
from PIL import Image, ImageDraw

prefix, out = sys.argv[1], sys.argv[2]
folder = os.path.expanduser(sys.argv[3] if len(sys.argv) > 3 else "~/Downloads/ASTRA-HOME-QC/shots")
files = sorted(glob.glob(os.path.join(folder, f"{prefix}-*.jpg")))
# (A prefix can also end part-way through a name: "final-high-IC" picks IC01, IC02 and so on.)
files = files or sorted(glob.glob(os.path.join(folder, f"{prefix}*.jpg")))
tw, th, cols = 640, 360, 3
rows = max(1, (len(files) + cols - 1) // cols)
sheet = Image.new("RGB", (cols * tw, rows * th), (10, 10, 16))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    x, y = (i % cols) * tw, (i // cols) * th
    sheet.paste(Image.open(f).convert("RGB").resize((tw, th)), (x, y))
    d.rectangle([x, y, x + 300, y + 22], fill=(0, 0, 0))
    d.text((x + 6, y + 5), os.path.basename(f)[len(prefix) + 1 : -4], fill=(255, 255, 255))
sheet.save(out, quality=88)
print(out, sheet.size, len(files), "shots")
