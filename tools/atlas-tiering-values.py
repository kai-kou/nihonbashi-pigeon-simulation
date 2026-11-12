#!/usr/bin/env python3
"""Recompute the atlas-tiering values of #165 [R5-3e] (Bolt 19).

Inputs (repository files, no network, no GML):
  * src/data/texture-atlas-layout.json (800 entries, Bolt 11 exact)
  * src/data/atlas-tiering-selection.json (the 71-building 512px tier)

Recomputes, from those two files only:
  * placed areas at long edge 128 / 256 / 512 (no-upscale rule)
  * the tiered-mix placed area and the GPU trial in the three readings
    (a) placed area x 4 bytes, no mipmap; (b) whole-sheet RGBA8;
    (c) (b) with mipmaps
  * 4096px sheet counts by shelf packing (same algorithm as
    tools/build-texture-atlas.py: sort by height desc, width desc,
    name; 2px gutter)
  * tile JPEG estimates by the per-file alpha model
    (jpeg_L = jpeg_128 * (area_L / area_128) ** alpha, alpha = 0.65,
    calibrated on the Bolt 10 21-file sample; range alpha 0.55-0.77),
    atlas JPEG (tile total x 1.04386, the Bolt 11 exact atlas/tile
    ratio), base64 bytes, and HTML totals
  * and asserts every recorded value of docs/atlas-tiering-values.md

Usage:
    python3 tools/atlas-tiering-values.py [--layout PATH] [--selection PATH]
    (defaults are the src/data paths above, relative to the repo root)

Only the Python standard library is used. Deterministic: no
timestamps, no randomness, no dict-order dependence.
"""

import argparse
import json
import math
import sys
from pathlib import Path

SHEET = 4096
GUTTER = 2
ALPHA = 0.65
ALPHA_LO = 0.55
ALPHA_HI = 0.77
ATLAS_TILE_RATIO = 2230406 / 2136700  # Bolt 11 exact
HTML_CURRENT = 11102394  # main index.html bytes (blob 2b848316...)
HTML_ATLAS_B64_OLD = 2973876  # inlined A2 atlas base64 bytes (Bolt 11 exact)
HTML_LIMIT = 15000000  # docs/plateau-hero-data.md section 10.4 (i)
GPU_CEILING_OLD_MIB = 102

# Recorded values (docs/atlas-tiering-values.md) verified by this script.
EXPECTED = {
    "area_128": 7841792,
    "area_256": 22925312,
    "area_512": 52748288,
    "mix_area": 33124352,
    "sheets_128": 1,
    "sheets_256": 2,
    "sheets_512": 4,
    "sheets_mix": 3,
    "mix_gpu_a_bytes": 132497408,
    "ceiling_mib": 130,
}


def dims(w, h, long_edge):
    """Re-encoded dimensions at target long edge (no-upscale rule).

    Same rule as tools/build-texture-atlas.py reencode(): files whose
    original long edge is at or below the target keep original size.
    """
    m = max(w, h)
    if m <= long_edge:
        return w, h
    s = long_edge / m
    return max(1, round(w * s)), max(1, round(h * s))


def shelf_pack(tiles, sheet=SHEET, gutter=GUTTER):
    """Pack tiles into sheets. Verbatim algorithm of
    tools/build-texture-atlas.py shelf_pack(). Tiles are sorted by
    height desc, width desc, name before packing."""
    tiles = sorted(tiles, key=lambda t: (-t["h"], -t["w"], t["name"]))
    sheets = []
    cur = []
    shelf_y = 0
    shelf_h = 0
    cursor_x = 0
    for t in tiles:
        tw = t["w"] + 2 * gutter
        th = t["h"] + 2 * gutter
        if tw > sheet or th > sheet:
            raise SystemExit(f"tile {t['name']} does not fit a {sheet}px sheet")
        if cursor_x + tw > sheet:
            shelf_y += shelf_h
            shelf_h = 0
            cursor_x = 0
        if shelf_y + th > sheet:
            sheets.append(cur)
            cur = []
            shelf_y = 0
            shelf_h = 0
            cursor_x = 0
        t = dict(t)
        t["x"] = cursor_x + gutter
        t["y"] = shelf_y + gutter
        cur.append(t)
        cursor_x += tw
        shelf_h = max(shelf_h, th)
    if cur:
        sheets.append(cur)
    return sheets


def b64_len(nbytes):
    return (nbytes + 2) // 3 * 4


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--layout", default="src/data/texture-atlas-layout.json")
    ap.add_argument("--selection", default="src/data/atlas-tiering-selection.json")
    args = ap.parse_args()
    layout = json.loads(Path(args.layout).read_text(encoding="utf-8"))
    selection = json.loads(Path(args.selection).read_text(encoding="utf-8"))
    entries = layout["entries"]
    assert len(entries) == 800, len(entries)
    sel_files = {row["file"] for row in selection["buildings"]}
    assert len(sel_files) == 71, len(sel_files)

    # --- placed areas (all files at one long edge) ---
    areas = {}
    for long_edge in (128, 256, 512):
        areas[long_edge] = sum(
            dims(e["orig_w"], e["orig_h"], long_edge)[0]
            * dims(e["orig_w"], e["orig_h"], long_edge)[1]
            for e in entries)
    # 128 dims must equal the stored re-encoded dims (Bolt 11 exact)
    for e in entries:
        assert dims(e["orig_w"], e["orig_h"], 128) == (e["w"], e["h"]), e["name"]
    assert areas[128] == EXPECTED["area_128"], areas[128]
    assert areas[256] == EXPECTED["area_256"], areas[256]
    assert areas[512] == EXPECTED["area_512"], areas[512]

    # --- tiered mix: 512 for selected files, 256 for the rest ---
    mix_tiles = []
    mix_area = 0
    for e in entries:
        long_edge = 512 if e["name"] in sel_files else 256
        w, h = dims(e["orig_w"], e["orig_h"], long_edge)
        mix_tiles.append({"name": e["name"], "w": w, "h": h})
        mix_area += w * h
    assert mix_area == EXPECTED["mix_area"], mix_area

    # --- sheet counts by shelf packing ---
    def sheet_count(long_edge_of):
        tiles = []
        for e in entries:
            w, h = dims(e["orig_w"], e["orig_h"], long_edge_of(e))
            tiles.append({"name": e["name"], "w": w, "h": h})
        return len(shelf_pack(tiles))

    n128 = sheet_count(lambda e: 128)
    n256 = sheet_count(lambda e: 256)
    n512 = sheet_count(lambda e: 512)
    nmix = len(shelf_pack(mix_tiles))
    assert (n128, n256, n512, nmix) == (
        EXPECTED["sheets_128"], EXPECTED["sheets_256"],
        EXPECTED["sheets_512"], EXPECTED["sheets_mix"]), (n128, n256, n512, nmix)

    # --- GPU trial, three readings (MiB = bytes / 1048576) ---
    def gpu(area, sheets):
        a = area * 4
        b = sheets * SHEET * SHEET * 4
        c = sheets * SHEET * SHEET * 4 * 4 // 3
        return a, b, c

    mix_a, mix_b, mix_c = gpu(mix_area, nmix)
    assert mix_a == EXPECTED["mix_gpu_a_bytes"], mix_a

    # --- JPEG estimates (per-file alpha model) ---
    def jpeg_total(long_edge_of, alpha):
        total = 0.0
        for e in entries:
            w, h = dims(e["orig_w"], e["orig_h"], long_edge_of(e))
            total += e["jpeg_bytes"] * ((w * h / (e["w"] * e["h"])) ** alpha)
        return total

    mix_jpeg = jpeg_total(lambda e: 512 if e["name"] in sel_files else 256, ALPHA)
    mix_jpeg_lo = jpeg_total(lambda e: 512 if e["name"] in sel_files else 256, ALPHA_LO)
    mix_jpeg_hi = jpeg_total(lambda e: 512 if e["name"] in sel_files else 256, ALPHA_HI)
    mix_atlas = mix_jpeg * ATLAS_TILE_RATIO
    mix_b64 = b64_len(round(mix_atlas))
    html_replace = HTML_CURRENT - HTML_ATLAS_B64_OLD + mix_b64
    html_naive = HTML_CURRENT + mix_b64
    html_external = HTML_CURRENT - HTML_ATLAS_B64_OLD

    # --- new ceiling: mix (a) rounded up to the next 5 MiB step ---
    mix_mib = mix_a / 1048576
    ceiling_mib = math.ceil(mix_mib / 5) * 5
    assert ceiling_mib == EXPECTED["ceiling_mib"], ceiling_mib

    print(f"files: {len(entries)} (512 tier: {len(sel_files)}, 256 tier: {len(entries) - len(sel_files)})")
    print(f"placed area: 128={areas[128]:,} px, 256={areas[256]:,} px, 512={areas[512]:,} px")
    print(f"mix area: {mix_area:,} px")
    print(f"sheets (4096px): 128={n128}, 256={n256}, 512={n512}, mix={nmix}")
    print(f"mix GPU: (a) {mix_a:,} bytes = {mix_mib:.2f} MiB | "
          f"(b) {mix_b:,} = {mix_b/1048576:.2f} MiB | (c) {mix_c:,} = {mix_c/1048576:.2f} MiB")
    print(f"mix tile JPEG (alpha={ALPHA}): {mix_jpeg:,.0f} "
          f"[range {mix_jpeg_lo:,.0f}-{mix_jpeg_hi:,.0f}]")
    print(f"mix atlas JPEG: {mix_atlas:,.0f} bytes, base64: {mix_b64:,} bytes")
    print(f"HTML total (replace): {html_replace:,} bytes "
          f"({'OVER' if html_replace > HTML_LIMIT else 'inside'} {HTML_LIMIT:,})")
    print(f"HTML total (naive add, double-counts the inlined A2 atlas): {html_naive:,} bytes")
    print(f"HTML total (externalized model): {html_external:,} bytes + external atlas {mix_atlas:,.0f}")
    print(f"new ceiling (reading (a)): {ceiling_mib} MiB = {ceiling_mib * 1048576:,} bytes "
          f"(mix {mix_mib:.2f} + margin {ceiling_mib - mix_mib:.2f} MiB)")
    print("ALL ASSERTIONS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
