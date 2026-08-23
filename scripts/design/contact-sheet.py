#!/usr/bin/env python3
"""
Contact sheets, so every frame gets LOOKED AT rather than sampled.

One sheet per (theme, width). Each cell is a route, scaled to a common column
width and cropped to a fixed height with the route name burnt into the corner.
A crop rather than a squash: a page squashed to fit turns a hierarchy problem
into an unreadable smear, and the top of a screen is where the hierarchy is.

WHAT A SHEET CANNOT SHOW: anything below the crop line. Every sheet prints the
crop height it used, and any frame taller than it is opened on its own.
"""
import sys, pathlib
from PIL import Image, ImageDraw

def sheet(files, out, cols, cell_w, cell_h):
    n = len(files)
    rows = (n + cols - 1) // cols
    pad, label_h = 6, 16
    W = cols * (cell_w + pad) + pad
    H = rows * (cell_h + label_h + pad) + pad
    sheet = Image.new('RGB', (W, H), (30, 30, 34))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB')
        scale = cell_w / im.width
        im = im.resize((cell_w, max(1, int(im.height * scale))), Image.LANCZOS)
        im = im.crop((0, 0, cell_w, min(cell_h, im.height)))
        cx = pad + (i % cols) * (cell_w + pad)
        cy = pad + (i // cols) * (cell_h + label_h + pad)
        sheet.paste(im, (cx, cy))
        name = pathlib.Path(f).stem.split('__')[1]
        d.text((cx + 2, cy + im.height + 2), name, fill=(230, 230, 235))
    sheet.save(out)
    print(f"{out}  {len(files)} frames  cell {cell_w}x{cell_h}")

if __name__ == '__main__':
    out, cols, cw, ch = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    sheet(sorted(sys.argv[5:]), out, cols, cw, ch)
