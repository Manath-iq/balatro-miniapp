#!/usr/bin/env python3
"""Slice the ChatGPT 4x4 portrait sheets into palette-locked pixel portraits.

    python3 scripts/art/slice_portraits.py            # all sheets -> src/client/art/portraits/<id>.png
    python3 scripts/art/slice_portraits.py --size 24 --preview /tmp/sheet.png

Sheets come from docs/art-prompts.md and live in assets/raw/ (gitignored). Only Pillow is required.
"""

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "assets" / "raw"
OUT = ROOT / "src" / "client" / "art" / "portraits"
PALETTE = ROOT / "assets" / "palette.json"

# Row-major cell order, matching the rows in docs/art-prompts.md.
SHEETS = {
    "passengers-1.png": [
        "zebra", "smallChange", "general", "aristocrat",
        "thousand", "honorStudent", "twentyOne", "student",
        "professor", "twins", "minimalist", "dacha",
        "seedGranny", "bottleCollector", "signalman", "stairClimber",
    ],
    "passengers-2.png": [
        "electrician", "fuseGrandpa", "powerEngineer", "adrenaline",
        "gymRat", "veteran", "nonstop", "accordionist",
        "auditor", "conductress", "blackIce", "blackout",
        "shiftChange", "trackWorks", "depotChief", "lastTram",
    ],
}

# Card suits and UI signal colours stay out of portraits: the bright reds (suitHeart, blow1) latch onto
# skin shadows and blotch faces; blow0 is kept for dark red clothing.
SKIP = {"suitHeart", "suitDiamond", "suitClub", "suitSpade", "go0", "go1", "blow1"}


def load_palette() -> list[tuple[int, int, int]]:
    colors = json.loads(PALETTE.read_text())["colors"]
    return [tuple(int(v[i : i + 2], 16) for i in (1, 3, 5)) for k, v in colors.items() if k not in SKIP]


def gutters(img: Image.Image, axis: int, n: int = 4) -> list[tuple[int, int]]:
    """Find the n cell spans along an axis by locating the near-black gutter bands between them."""
    g = img.convert("L")
    w, h = g.size
    length = w if axis == 0 else h
    px = g.load()
    step = 4
    dark = []
    for i in range(length):
        samples = [px[i, j] if axis == 0 else px[j, i] for j in range(0, h if axis == 0 else w, step)]
        dark.append(sum(s < 12 for s in samples) / len(samples) > 0.9)
    spans, start = [], None
    for i, d in enumerate(dark + [True]):
        if not d and start is None:
            start = i
        elif d and start is not None:
            if i - start > length // (n * 2):
                spans.append((start, i))
            start = None
    if len(spans) != n:
        cell = length / n
        spans = [(round(k * cell), round((k + 1) * cell)) for k in range(n)]
    return spans


def quantize(img: Image.Image, pal: list[tuple[int, int, int]]) -> Image.Image:
    p = Image.new("P", (1, 1))
    flat = [c for rgb in pal for c in rgb]
    p.putpalette(flat + flat[:3] * (256 - len(pal)))
    return img.convert("RGB").quantize(palette=p, dither=Image.Dither.NONE).convert("RGB")


def adaptive(img: Image.Image, colors: int) -> Image.Image:
    """Per-portrait palette: keeps skin tones and faces readable at tiny sizes."""
    return img.quantize(colors=colors, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE).convert("RGB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=40, help="portrait side in art pixels")
    ap.add_argument("--inset", type=int, default=6, help="px trimmed inside each cell to drop gutter bleed")
    ap.add_argument("--preview", type=Path, help="also write an 8x upscaled contact sheet here")
    ap.add_argument("--colors", type=int, default=20, help="adaptive colours per portrait; 0 = lock to the game palette")
    args = ap.parse_args()

    pal = load_palette()
    OUT.mkdir(parents=True, exist_ok=True)
    made: list[tuple[str, Image.Image]] = []
    for sheet, ids in SHEETS.items():
        src = RAW / sheet
        if not src.exists():
            print(f"skip {sheet}: not in assets/raw/")
            continue
        img = Image.open(src).convert("RGB")
        cols, rows = gutters(img, 0), gutters(img, 1)
        for k, pid in enumerate(ids):
            (x0, x1), (y0, y1) = cols[k % 4], rows[k // 4]
            side = min(x1 - x0, y1 - y0) - 2 * args.inset
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
            cell = img.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side))
            down = cell.resize((args.size, args.size), Image.Resampling.BOX)
            small = adaptive(down, args.colors) if args.colors else quantize(down, pal)
            small.save(OUT / f"{pid}.png", optimize=True)
            made.append((pid, small))
        print(f"{sheet}: {len(ids)} portraits, cells x={cols} y={rows}")

    if args.preview and made:
        z, gap = 8, 8
        s = args.size * z
        sheet = Image.new("RGB", (8 * (s + gap) + gap, ((len(made) + 7) // 8) * (s + gap) + gap), pal[0])
        for i, (_, im) in enumerate(made):
            sheet.paste(im.resize((s, s), Image.Resampling.NEAREST), (gap + (i % 8) * (s + gap), gap + (i // 8) * (s + gap)))
        sheet.save(args.preview)
        print(f"preview -> {args.preview}")


if __name__ == "__main__":
    main()
