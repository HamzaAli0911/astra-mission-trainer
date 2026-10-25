"""Before/after pairs: python3 tools/qc/compare.py BEFORE AFTER OUT.jpg [first] [last] [shots folder].
Pairs shots with the same name after the prefix; first/last limit by the two-character shot number."""
import glob, os, sys
from PIL import Image, ImageDraw

a, b, out = sys.argv[1], sys.argv[2], sys.argv[3]
first = sys.argv[4] if len(sys.argv) > 4 else "00"
last = sys.argv[5] if len(sys.argv) > 5 else "zz"
folder = os.path.expanduser(sys.argv[6] if len(sys.argv) > 6 else "~/Downloads/ASTRA-HOME-QC/shots")
names = [os.path.basename(f)[len(a) + 1 :] for f in sorted(glob.glob(os.path.join(folder, f"{a}-*.jpg")))]
names = [n for n in names if first <= n[:2] <= last and os.path.exists(os.path.join(folder, f"{b}-{n}"))]
tw, th = 800, 450
sheet = Image.new("RGB", (2 * tw, max(1, len(names)) * th), (10, 10, 16))
d = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    for j, p in enumerate((a, b)):
        sheet.paste(Image.open(os.path.join(folder, f"{p}-{n}")).convert("RGB").resize((tw, th)), (j * tw, i * th))
        d.rectangle([j * tw, i * th, j * tw + 320, i * th + 22], fill=(0, 0, 0))
        d.text((j * tw + 6, i * th + 5), f"{p.upper()}  {n[:-4]}", fill=(255, 255, 255))
sheet.save(out, quality=86)
print(out, sheet.size, len(names), "pairs")
