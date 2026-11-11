#!/usr/bin/env python3
"""Generate src/data/city-hero-buildings.js from the PLATEAU-CITY v1 JSON.

Bolt 第7回（#151 [R5-P] / #140 描画統合 第1段階）で導入。
Input : PLATEAU-CITY v1 中間 JSON（Bolt 第6回で再生成したもの。
        repo には含めない。既定は Bolt 第6回の作業ファイル）。
Output: src/data/city-hero-buildings.js
        window.CITY_HERO = {"buildings": [[h_dm, usage, footprint,
        lod2_index, baseZ_dm], ...]};  (1,443 件)

- buildings の順序は中間 JSON の順序と同一で、src/data/citygeo-hero.js
  の counts の順序とも同一であること（buildCity() は counts[bi] を
  CITY_HERO.buildings[bi] と対応付けて読む）。
- フットプリントは中間 JSON のまま（連続重複点 15 棟を含む）出す。
  citygeo-hero.js の壁は 6n 頂点（n は重複点を含む点数）で生成されて
  いるため、重複点を除去すると壁の 6n 規則と counts が一致しなくなる。
  重複辺の壁三角形は面積ゼロで描画に影響しない（Bolt 第6回 §2.6）。
- 決定論的: 時刻・乱数を含まない。同じ入力からは同じバイト列を出す。

Usage:
    python3 tools/build-city-hero-buildings.py \
        [--input hidden_files/bolt6/plateau-city-hero.json] \
        [--out src/data/city-hero-buildings.js]
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = Path(
    "/home/hatch/workspace/goals/nihonbashi-pigeon-simulation/"
    "hidden_files/bolt6/plateau-city-hero.json")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", default=str(DEFAULT_INPUT))
    ap.add_argument("--out", default=str(ROOT / "src/data/city-hero-buildings.js"))
    args = ap.parse_args()

    data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    buildings = data["buildings"]
    assert len(buildings) == 1443, len(buildings)
    for b in buildings:
        assert len(b) == 5, b  # [h_dm, usage, footprint, lod2_index, baseZ_dm]
        assert len(b[2]) % 2 == 0 and len(b[2]) >= 6

    body = json.dumps({"buildings": buildings}, ensure_ascii=False,
                      separators=(",", ":"))
    out = "window.CITY_HERO = " + body + ";\n"
    out_path = Path(args.out)
    out_path.write_text(out, encoding="utf-8")
    sha = hashlib.sha256(out.encode("utf-8")).hexdigest()
    print(f"wrote {out_path}: {len(out.encode('utf-8'))} bytes, "
          f"sha256 {sha}, buildings {len(buildings)}, "
          f"lod2 {sum(1 for b in buildings if b[3] >= 0)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
