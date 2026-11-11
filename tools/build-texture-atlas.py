#!/usr/bin/env python3
"""Build a single-sheet texture atlas from PLATEAU facade textures.

Bolt 11 (R5-3a, #157): hero meshes 52350421 + 52350422, bldg files
referenced by the GML (800 files). Each texture is fetched from the
PLATEAU zip by HTTP Range (same method as the Bolt 10 sample:
``bolt10/tex-hero-sample.py``), re-encoded to long edge 128 px, JPEG
quality 85, and shelf-packed into one 4096x4096 sheet with a 2 px
gutter around each tile (mipmap-bleed guard; the gutter is empty
sheet space, the recorded rectangle is the image region only).

Inputs: a manifest JSON (list of zip entries: name / offset / comp /
uncomp / method), produced for this unit from
``plateau-relocation/proto/tex-entries-core4.json`` intersected with
the GML texture references. The manifest is committed alongside the
outputs as ``src/data/texture-atlas-sources.json`` so the build is
re-runnable from the repository.

Outputs:
  * the atlas JPEG (default ``src/data/texture-atlas.jpg``)
  * the layout JSON (default ``src/data/texture-atlas-layout.json``):
    per file: sheet rectangle (pixels, origin top-left), normalised UV
    (v measured from the top of the sheet; the v flip is handled at
    draw integration, #158/#159), original and re-encoded dimensions
    and byte counts, plus run statistics (JPEG bytes, base64 bytes,
    pixel area, sheet count, fill rate).

Usage:
    python3 tools/build-texture-atlas.py --manifest <manifest.json> \\
        --atlas-out <atlas.jpg> --layout-out <layout.json>

Only the Python standard library and Pillow are used. No timestamps
are embedded in the outputs; the same manifest always builds the
same atlas bytes (Pillow JPEG encoding is deterministic for the same
input, quality and version).
"""

import argparse
import base64
import concurrent.futures
import hashlib
import io
import json
import struct
import sys
import threading
import time
import urllib.request
import zlib
from pathlib import Path

from PIL import Image

URL = ("https://assets.cms.plateau.reearth.io/assets/10/"
       "a0aecb-67d1-4463-92d5-d67c99f3b8b6/"
       "27100_osaka-shi_city_2025_citygml_1_op.zip")
SHEET = 4096
LONG_EDGE = 128
QUALITY = 85
GUTTER = 2
MAX_ATTEMPTS = 3


def fetch_range(start, length):
    req = urllib.request.Request(
        URL, headers={"Range": f"bytes={start}-{start+length-1}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def fetch_with_retries(start, length):
    """Return (data, attempts). Raises on the final failed attempt."""
    last = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return fetch_range(start, length), attempt
        except Exception as exc:  # noqa: BLE001 - retried, then reported
            last = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(1.0 * attempt)
    raise last


def extract(entry, stats, lock):
    hdr, a1 = fetch_with_retries(entry["offset"], 30)
    with lock:
        stats["requests"] += 1
        stats["retries"] += a1 - 1
    assert hdr[:4] == b"PK\x03\x04", hdr[:4]
    nlen, elen = struct.unpack("<HH", hdr[26:30])
    data_start = entry["offset"] + 30 + nlen + elen
    if entry["method"] == 0:
        data, a2 = fetch_with_retries(data_start, entry["uncomp"])
    else:
        raw, a2 = fetch_with_retries(data_start, entry["comp"])
        data = zlib.decompress(raw, -zlib.MAX_WBITS)
        assert len(data) == entry["uncomp"], (len(data), entry["uncomp"])
    with lock:
        stats["requests"] += 1
        stats["retries"] += a2 - 1
    return data


def reencode(data, long_edge=LONG_EDGE, quality=QUALITY):
    """Return (jpeg_bytes, orig_w, orig_h, new_w, new_h)."""
    img = Image.open(io.BytesIO(data))
    img.load()
    w, h = img.size
    m = max(w, h)
    if m <= long_edge:
        nw, nh = w, h
    else:
        s = long_edge / m
        nw, nh = max(1, round(w * s)), max(1, round(h * s))
    im2 = img.resize((nw, nh), Image.LANCZOS) if (nw, nh) != (w, h) else img
    buf = io.BytesIO()
    im2.convert("RGB").save(buf, "JPEG", quality=quality)
    return buf.getvalue(), w, h, nw, nh


def shelf_pack(tiles, sheet=SHEET, gutter=GUTTER):
    """Pack tiles (dicts with w/h) into sheets. Tiles must be sorted by
    height desc, then width desc before calling. Returns a list of
    sheets; each sheet is a list of tiles with x/y (image-region
    top-left, gutter excluded)."""
    sheets = []
    cur = []          # tiles on the current sheet
    shelf_y = 0       # y of the current shelf (top edge incl. gutter)
    shelf_h = 0       # height of the current shelf (incl. gutters)
    cursor_x = 0      # x where the next tile goes (incl. left gutter)
    for t in tiles:
        tw = t["w"] + 2 * gutter
        th = t["h"] + 2 * gutter
        if tw > sheet or th > sheet:
            raise SystemExit(f"tile {t['name']} {t['w']}x{t['h']} "
                             f"does not fit a {sheet}px sheet")
        if cursor_x + tw > sheet:
            # new shelf on this sheet
            shelf_y += shelf_h
            shelf_h = 0
            cursor_x = 0
        if shelf_y + th > sheet:
            # new sheet
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


def process_one(entry, stats, lock):
    data = extract(entry, stats, lock)
    jpeg, ow, oh, nw, nh = reencode(data)
    return {
        "name": entry["name"].split("/")[-1],
        "path": entry["name"],
        "mesh": entry["name"].split("/")[2][:8],
        "orig_bytes": len(data),
        "orig_w": ow,
        "orig_h": oh,
        "w": nw,
        "h": nh,
        "jpeg_bytes": len(jpeg),
        "jpeg": base64.b64encode(jpeg).decode("ascii"),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--atlas-out", required=True)
    ap.add_argument("--layout-out", required=True)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--long-edge", type=int, default=LONG_EDGE)
    ap.add_argument("--quality", type=int, default=QUALITY)
    ap.add_argument("--sheet", type=int, default=SHEET)
    ap.add_argument("--gutter", type=int, default=GUTTER)
    args = ap.parse_args()

    entries = json.load(open(args.manifest, encoding="utf-8"))
    entries = sorted(entries, key=lambda e: e["name"])
    print(f"manifest: {len(entries)} files", flush=True)
    t0 = time.time()
    stats = {"requests": 0, "retries": 0}
    lock = threading.Lock()
    tiles = []
    failures = []
    with concurrent.futures.ThreadPoolExecutor(
            max_workers=args.workers) as pool:
        futs = {pool.submit(process_one, e, stats, lock): e
                for e in entries}
        done = 0
        for fut in concurrent.futures.as_completed(futs):
            e = futs[fut]
            done += 1
            try:
                tiles.append(fut.result())
            except Exception as exc:  # noqa: BLE001 - recorded, not hidden
                failures.append({"name": e["name"], "error": str(exc)})
            if done % 100 == 0:
                print(f"  fetched+re-encoded {done}/{len(entries)} "
                      f"({time.time()-t0:.0f}s)", flush=True)
    if failures:
        print(f"FAILURES: {len(failures)}", flush=True)
        for f in failures:
            print(" ", f, flush=True)
        return 1
    tiles.sort(key=lambda t: (-t["h"], -t["w"], t["name"]))
    sheets = shelf_pack(tiles, sheet=args.sheet, gutter=args.gutter)
    print(f"packed into {len(sheets)} sheet(s) of {args.sheet}px",
          flush=True)

    area = sum(t["w"] * t["h"] for t in tiles)
    sheet_area = args.sheet * args.sheet * len(sheets)
    layout_entries = []
    atlas_images = []
    for si, sheet_tiles in enumerate(sheets):
        canvas = Image.new("RGB", (args.sheet, args.sheet), (255, 255, 255))
        for t in sheet_tiles:
            img = Image.open(io.BytesIO(
                base64.b64decode(t.pop("jpeg"))))
            img.load()
            canvas.paste(img, (t["x"], t["y"]))
            layout_entries.append({
                "name": t["name"],
                "path": t["path"],
                "mesh": t["mesh"],
                "sheet": si,
                "x": t["x"], "y": t["y"], "w": t["w"], "h": t["h"],
                "u0": t["x"] / args.sheet,
                "v0": t["y"] / args.sheet,
                "u1": (t["x"] + t["w"]) / args.sheet,
                "v1": (t["y"] + t["h"]) / args.sheet,
                "orig_w": t["orig_w"], "orig_h": t["orig_h"],
                "orig_bytes": t["orig_bytes"],
                "jpeg_bytes": t["jpeg_bytes"],
            })
        atlas_images.append(canvas)
    if len(atlas_images) != 1:
        print(f"note: {len(atlas_images)} sheets; only the first is "
              f"written to --atlas-out", flush=True)
    buf = io.BytesIO()
    atlas_images[0].save(buf, "JPEG", quality=args.quality)
    atlas_bytes = buf.getvalue()
    Path(args.atlas_out).write_bytes(atlas_bytes)

    b64_len = (len(atlas_bytes) + 2) // 3 * 4
    layout = {
        "meta": {
            "generator": "tools/build-texture-atlas.py",
            "long_edge": args.long_edge,
            "quality": args.quality,
            "sheet_px": args.sheet,
            "gutter_px": args.gutter,
            "sheets": len(sheets),
            "files": len(tiles),
            "pixel_area": area,
            "fill_rate": area / sheet_area,
            "atlas_jpeg_bytes": len(atlas_bytes),
            "atlas_jpeg_sha256": hashlib.sha256(atlas_bytes).hexdigest(),
            "atlas_base64_bytes": b64_len,
            "atlas_gpu_bytes_rgba8": args.sheet * args.sheet * 4,
            "atlas_gpu_bytes_rgba8_mipmaps": (
                args.sheet * args.sheet * 4 * 4 // 3),
            "tile_jpeg_bytes_total": sum(t["jpeg_bytes"] for t in tiles),
            "orig_bytes_total": sum(t["orig_bytes"] for t in tiles),
            "fetch_requests": stats["requests"],
            "fetch_retries": stats["retries"],
            "fetch_failures": 0,
            "elapsed_seconds": round(time.time() - t0, 1),
        },
        "entries": sorted(layout_entries, key=lambda e: e["name"]),
    }
    Path(args.layout_out).write_text(
        json.dumps(layout, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(f"atlas: {len(atlas_bytes)} bytes "
          f"sha256 {layout['meta']['atlas_jpeg_sha256'][:16]}... "
          f"base64 {b64_len} bytes", flush=True)
    print(f"area: {area} px fill {area/sheet_area:.4f} "
          f"tile jpeg total {layout['meta']['tile_jpeg_bytes_total']} "
          f"elapsed {time.time()-t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
