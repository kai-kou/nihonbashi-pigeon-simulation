#!/usr/bin/env python3
"""Remap LOD2 face UVs from per-file texture coordinates to atlas coordinates.

Bolt 12 (R5-3b, #158): the hero meshes' LOD2 faces carry GML texture
coordinates (u, v) in [0, 1] within their individual PLATEAU texture
file (see the "tex" entries of the PLATEAU-CITY v1 intermediate JSON).
This tool converts every such UV into the coordinates of the single
4096px atlas sheet built by tools/build-texture-atlas.py (Bolt 11,
#157), using src/data/texture-atlas-layout.json (file name -> sheet
rectangle), and writes the result into src/data/citygeo-hero.js as a
new `uv` field (base64 Float32, 2 floats per vertex, parallel to the
existing `pos` array) plus a small self-describing `atlas` header.

Remap formula (sheet-top-origin frame, the same frame as the layout's
u0/v0/u1/v1, where v is measured from the top edge of the sheet):
    u' = u0 + u * (u1 - u0)
    v' = v0 + v * (v1 - v0)
(u0, v0, u1, v1) is the tile rectangle of the face's texture file.
v' is measured from the top of the sheet, exactly like the layout's
v0/v1; the conversion to the three.js flipY convention
(v_three = 1 - v') is draw integration (#159), not this step.

Sentinel: vertices with no atlas UV get (0, 0). (0, 0) can never occur
from a real remap, because every tile rectangle has u0 >= 2/4096 and
v0 >= 2/4096 (2 px gutter), so u' >= 0.00048828125 and
v' >= 0.00048828125. Two cases use the sentinel, both meaning
"procedural facade, as now" for draw integration (#159):
  - LOD1 buildings (643 buildings): no LOD2, no texture by design.
  - LOD2 faces with no GML texture entry (60 faces on 35 buildings,
    393 vertices): the GML has no ParameterizedTexture for these wall
    faces, so there is no individual-texture UV to remap. They stay
    procedural, the same disposition #157 applied to out-of-scope
    files (unreferenced / brid / cons), extended from buildings to
    faces. They are counted in the run stats and listed in
    docs/plateau-hero-data.md section 12; they are NOT counted as
    "unhandled" faces (see the verification script).

Geometry is untouched: pos/counts are regenerated from the same
intermediate JSON with tools/build-citygeo-hero.py and must match the
on-disk citygeo-hero.js byte for byte before the new file is written.
The fan-triangulation order used here mirrors fan_lod2_faces in that
module exactly (kept types Wall/Roof/Ceiling, ring order as stored,
fan (v0, vi, vi+1)); the pos/counts equality check above is what
proves the vertex order matches.

Inputs:
  - PLATEAU-CITY v1 JSON (default: the Bolt 6 file, SHA-256
    0bf4c50b1a9bfbcf81745854ca198455f4978c235c847a9b9369479bfd1234bf).
    It is not committed in the repository; see docs/plateau-hero-data.md
    section 12 for its provenance.
  - src/data/texture-atlas-layout.json (Bolt 11, committed).
  - src/data/citygeo-hero.js (current, pre-remap; pos/counts must match
    a fresh regeneration).

Output: src/data/citygeo-hero.js, same pos/counts plus uv + atlas.

Determinism: pure Python stdlib, no timestamps, no randomness, no
dict/set iteration over unordered data. Re-running the same command
produces byte-identical output (SHA-256 verified).

Usage:
    python3 tools/remap-uv-atlas.py --city plateau-city-hero.json \\
        --layout src/data/texture-atlas-layout.json \\
        --hero src/data/citygeo-hero.js
"""
import argparse
import base64
import hashlib
import json
import re
import struct
import sys
from pathlib import Path

import importlib.util

_HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    'build_citygeo_hero', _HERE / 'build-citygeo-hero.py')
bch = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bch)  # fan order / pos regeneration

KEEP_TYPES = (0, 1, 3)  # Wall, Roof, Ceiling; Ground (2) excluded, as in build-citygeo-hero
HERO_RE = re.compile(
    r"""^window\.CITYGEO_HERO = \{ pos: '([^']*)', counts: '([^']*)' \};\n$""")


def _f32(v):
    return struct.unpack('<f', struct.pack('<f', v))[0]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--city', required=True,
                    help='PLATEAU-CITY v1 JSON (plateau-city-hero.json)')
    ap.add_argument('--layout', required=True,
                    help='texture-atlas-layout.json (Bolt 11)')
    ap.add_argument('--hero', required=True,
                    help='src/data/citygeo-hero.js (rewritten in place)')
    args = ap.parse_args(argv)

    with open(args.city, encoding='utf-8') as f:
        data = json.load(f)
    if data.get('format') != 'PLATEAU-CITY v1':
        raise SystemExit(f"unexpected format: {data.get('format')!r}")
    with open(args.layout, 'rb') as f:
        layout_bytes = f.read()
    layout = json.loads(layout_bytes.decode('utf-8'))
    rects = {}
    for e in layout['entries']:
        if e['sheet'] != 0:
            raise SystemExit(f"multi-sheet layout not supported: {e['name']}")
        rects[e['name']] = (e['u0'], e['v0'], e['u1'], e['v1'])

    hero_path = Path(args.hero)
    hero_old = hero_path.read_text(encoding='utf-8')
    m = HERO_RE.match(hero_old)
    if not m:
        raise SystemExit('citygeo-hero.js is not in the expected pre-remap form '
                         '(pos + counts only)')
    pos_b64_old, counts_b64_old = m.group(1), m.group(2)

    # Geometry must be untouched: regenerate pos/counts and compare.
    pos, counts, gen_stats = bch.build_hero(data)
    pos_b64 = base64.b64encode(struct.pack('<%dh' % len(pos), *pos)).decode()
    cnt_b64 = base64.b64encode(struct.pack('<%dI' % len(counts), *counts)).decode()
    if pos_b64 != pos_b64_old or cnt_b64 != counts_b64_old:
        raise SystemExit('regenerated pos/counts differ from on-disk '
                         'citygeo-hero.js; refusing to remap (geometry drift)')
    nverts = len(pos) // 3
    if counts and sum(counts) != nverts:
        raise SystemExit('counts do not sum to the vertex count')

    lod2_by_b = {r['b']: r for r in data['lod2']}
    uv = [0.0] * (nverts * 2)
    stats = {
        'buildings': len(data['buildings']),
        'lod2_buildings': 0,
        'lod1_buildings': 0,
        'verts': nverts,
        'faces_kept': 0,
        'faces_remapped': 0,
        'faces_no_texture': 0,
        'faces_unhandled': 0,
        'verts_remapped': 0,
        'verts_sentinel_lod2_no_texture': 0,
        'verts_sentinel_lod1': 0,
        'no_texture_buildings': [],
        'max_rounding_err_atlas_units': 0.0,
        'max_rounding_err_tile_texels': 0.0,
        'uv_min': [1.0, 1.0],
        'uv_max': [0.0, 0.0],
    }
    # Source-UV quantisation bound: convert-plateau.py rounds GML UVs to
    # 4 decimals (max 0.00005 in source units), scaled by the tile size
    # (max 128/4096 of the sheet).
    stats['source_uv_quantisation_bound_atlas_units'] = 0.00005 * 128 / 4096
    stats['source_uv_quantisation_bound_tile_texels'] = (
        stats['source_uv_quantisation_bound_atlas_units'] * 4096)

    vbase = 0
    for bi, b in enumerate(data['buildings']):
        count = counts[bi]
        if bi in lod2_by_b:
            stats['lod2_buildings'] += 1
            rec = lod2_by_b[bi]
            texmap = {t[0]: t for t in rec['tex']}
            # Re-walk the kept faces in fan_lod2_faces order, tracking the
            # vertex offset each face's fan triangles occupy.
            offset = vbase
            for fi, (tc, ring) in enumerate(rec['faces']):
                if tc not in KEEP_TYPES:
                    continue
                stats['faces_kept'] += 1
                npts = len(ring) // 3
                ntris = npts - 2
                if fi in texmap:
                    _, img, uv_src = texmap[fi]
                    if img not in rects:
                        stats['faces_unhandled'] += 1
                        continue
                    if len(uv_src) // 2 not in (npts, npts + 1):
                        stats['faces_unhandled'] += 1
                        continue
                    if len(uv_src) // 2 == npts + 1 and uv_src[:2] != uv_src[-2:]:
                        stats['faces_unhandled'] += 1
                        continue
                    u0, v0, u1, v1 = rects[img]
                    du, dv = u1 - u0, v1 - v0
                    stats['faces_remapped'] += 1
                    for ti in range(ntris):
                        for rj in (0, ti + 1, ti + 2):
                            su, sv = uv_src[rj * 2], uv_src[rj * 2 + 1]
                            eu = u0 + su * du
                            ev = v0 + sv * dv
                            fu, fv = _f32(eu), _f32(ev)
                            err = max(abs(fu - eu), abs(fv - ev))
                            if err > stats['max_rounding_err_atlas_units']:
                                stats['max_rounding_err_atlas_units'] = err
                            tex_err = err * 4096
                            if tex_err > stats['max_rounding_err_tile_texels']:
                                stats['max_rounding_err_tile_texels'] = tex_err
                            if eu < stats['uv_min'][0]:
                                stats['uv_min'][0] = eu
                            if ev < stats['uv_min'][1]:
                                stats['uv_min'][1] = ev
                            if eu > stats['uv_max'][0]:
                                stats['uv_max'][0] = eu
                            if ev > stats['uv_max'][1]:
                                stats['uv_max'][1] = ev
                            gi = offset + ti * 3 + (0 if rj == 0 else
                                                   1 if rj == ti + 1 else 2)
                            uv[gi * 2] = fu
                            uv[gi * 2 + 1] = fv
                            stats['verts_remapped'] += 1
                else:
                    stats['faces_no_texture'] += 1
                    if bi not in stats['no_texture_buildings']:
                        stats['no_texture_buildings'].append(bi)
                    # sentinel (0, 0) already in place; count the vertices
                    stats['verts_sentinel_lod2_no_texture'] += ntris * 3
                offset += ntris * 3
            if offset != vbase + count:
                raise SystemExit(
                    f'vertex walk mismatch at building {bi}: '
                    f'{offset} != {vbase + count}')
        else:
            stats['lod1_buildings'] += 1
            stats['verts_sentinel_lod1'] += count
        vbase += count
    if vbase != nverts:
        raise SystemExit(f'vertex walk total mismatch: {vbase} != {nverts}')
    if stats['faces_unhandled']:
        raise SystemExit(f"{stats['faces_unhandled']} unhandled faces; "
                         'refusing to write (see verification script)')
    if stats['faces_kept'] != gen_stats['faces_kept']:
        raise SystemExit('kept-face count disagrees with build-citygeo-hero: '
                         f"{stats['faces_kept']} != {gen_stats['faces_kept']}")

    uv_b64 = base64.b64encode(struct.pack('<%df' % len(uv), *uv)).decode()
    atlas = {
        'sheet': 0,
        'size_px': 4096,
        'image': 'texture-atlas.jpg',
        'tiles': len(layout['entries']),
        'layout_sha256': hashlib.sha256(layout_bytes).hexdigest(),
        'uv_convention': 'sheet-top-origin (v from top edge; '
                         'three.js flipY conversion v=1-v is #159)',
        'uv_sentinel': [0, 0],
    }
    js = ("window.CITYGEO_HERO = { pos: '%s', counts: '%s', uv: '%s', "
          "atlas: %s };\n" % (pos_b64, cnt_b64, uv_b64,
                              json.dumps(atlas, ensure_ascii=False,
                                         separators=(',', ':'))))
    hero_path.write_text(js, encoding='utf-8')
    stats['uv_b64_bytes'] = len(uv_b64)
    stats['js_bytes'] = len(js.encode('utf-8'))
    stats['js_sha256'] = hashlib.sha256(js.encode('utf-8')).hexdigest()
    stats['no_texture_faces_by_building'] = {
        str(bi): sum(1 for r in [lod2_by_b[bi]] for fi, (tc, _ring)
                     in enumerate(r['faces'])
                     if tc in KEEP_TYPES and fi not in {t[0] for t in r['tex']})
        for bi in stats['no_texture_buildings']}
    print(json.dumps(stats, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
