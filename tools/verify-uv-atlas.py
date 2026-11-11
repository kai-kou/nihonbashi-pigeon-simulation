#!/usr/bin/env python3
"""Independently verify the UV remap in src/data/citygeo-hero.js.

Bolt 12 (R5-3b, #158) verification, written separately from
tools/remap-uv-atlas.py: it re-derives the expected atlas UVs from the
committed artifacts only (the PLATEAU-CITY v1 intermediate JSON, the
Bolt 11 layout, and the hero file itself) and checks the following:

  - pos/counts in citygeo-hero.js are identical to a fresh regeneration
    from the intermediate JSON (geometry untouched by the remap).
  - building counts are unchanged: 1,443 buildings, 800 LOD2.
  - uv has exactly 2 floats per vertex, parallel to pos.
  - every remapped UV equals the independently recomputed Float32
    value exactly (formula u' = u0 + u*(u1-u0), v' = v0 + v*(v1-v0),
    sheet-top-origin frame, same as the layout's u0/v0/u1/v1).
  - every UV (remapped and sentinel) lies in [0, 1]; range violations 0.
  - unhandled faces 0, where "unhandled" means a kept face WITH a GML
    texture entry that could not be remapped: texture file missing
    from the layout, UV/ring length mismatch, closing UV pair not
    equal to the first, or a remapped UV outside [0, 1].
  - faces with NO GML texture entry are a separate counted category
    ("no_texture", procedural fallback, sentinel (0, 0)); they are
    not counted as unhandled. Their count and building list are
    reported so the Approver can judge the disposition.
  - sentinel (0, 0) vertices occur only where expected: LOD1 vertices
    plus the no-texture LOD2 faces' vertices.

Exit status is 0 only when all checks pass (range violations 0,
unhandled faces 0, exact UV equality, geometry identical). The
no-texture count is reported, not failed: it is a source-data fact
(the GML has no texture for those faces), not a remap failure.

Usage:
    python3 tools/verify-uv-atlas.py --city plateau-city-hero.json \\
        --layout src/data/texture-atlas-layout.json \\
        --hero src/data/citygeo-hero.js
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import re
import struct
import sys
from pathlib import Path

KEEP_TYPES = (0, 1, 3)
HERO_RE = re.compile(
    r"""^window\.CITYGEO_HERO = \{ pos: '([^']*)', counts: '([^']*)', """
    r"""uv: '([^']*)', atlas: (\{.*\}) \};\n$""", re.S)


def _f32(v):
    return struct.unpack('<f', struct.pack('<f', v))[0]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--city', required=True)
    ap.add_argument('--layout', required=True)
    ap.add_argument('--hero', required=True)
    args = ap.parse_args(argv)

    with open(args.city, encoding='utf-8') as f:
        data = json.load(f)
    assert data.get('format') == 'PLATEAU-CITY v1', data.get('format')
    with open(args.layout, 'rb') as f:
        layout_bytes = f.read()
    layout = json.loads(layout_bytes.decode('utf-8'))
    rects = {e['name']: (e['u0'], e['v0'], e['u1'], e['v1'])
             for e in layout['entries']}

    hero_text = Path(args.hero).read_text(encoding='utf-8')
    m = HERO_RE.match(hero_text)
    if not m:
        print('FAIL: citygeo-hero.js is not in the expected post-remap form')
        return 1
    pos_b64, counts_b64, uv_b64, atlas_json = m.groups()
    atlas = json.loads(atlas_json)
    pos = struct.unpack('<%dh' % (len(base64.b64decode(pos_b64)) // 2),
                        base64.b64decode(pos_b64))
    counts = struct.unpack('<%dI' % (len(base64.b64decode(counts_b64)) // 4),
                           base64.b64decode(counts_b64))
    uv_raw = base64.b64decode(uv_b64)
    uv = struct.unpack('<%df' % (len(uv_raw) // 4), uv_raw)
    nverts = len(pos) // 3

    # Geometry untouched: regenerate pos/counts with the Bolt 6 generator.
    here = Path(__file__).resolve().parent
    spec = importlib.util.spec_from_file_location(
        'build_citygeo_hero', here / 'build-citygeo-hero.py')
    bch = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bch)
    regen_pos, regen_counts, gen_stats = bch.build_hero(data)
    regen_pos_b64 = base64.b64encode(
        struct.pack('<%dh' % len(regen_pos), *regen_pos)).decode()
    regen_cnt_b64 = base64.b64encode(
        struct.pack('<%dI' % len(regen_counts), *regen_counts)).decode()

    checks = {}
    checks['pos_counts_identical_to_regeneration'] = (
        pos_b64 == regen_pos_b64 and counts_b64 == regen_cnt_b64)
    checks['buildings'] = len(data['buildings'])
    checks['lod2_buildings'] = len(data['lod2'])
    checks['counts_sum_is_verts'] = sum(counts) == nverts
    checks['uv_floats_are_2_per_vertex'] = len(uv) == nverts * 2
    checks['atlas_header_layout_sha256_matches'] = (
        atlas.get('layout_sha256') ==
        hashlib.sha256(layout_bytes).hexdigest())
    checks['atlas_header_tiles'] = atlas.get('tiles')
    checks['atlas_header_sheet'] = atlas.get('sheet')

    lod2_by_b = {r['b']: r for r in data['lod2']}
    remapped = 0
    no_texture_faces = 0
    unhandled = 0
    unhandled_detail = []
    out_of_range = 0
    exact_mismatches = 0
    mismatch_detail = []
    sentinel_expected = 0
    sentinel_found = 0
    sentinel_unexpected = []
    max_err = 0.0
    no_tex_buildings = {}

    vbase = 0
    for bi, b in enumerate(data['buildings']):
        count = counts[bi]
        if bi in lod2_by_b:
            rec = lod2_by_b[bi]
            texmap = {t[0]: t for t in rec['tex']}
            offset = vbase
            for fi, (tc, ring) in enumerate(rec['faces']):
                if tc not in KEEP_TYPES:
                    continue
                npts = len(ring) // 3
                ntris = npts - 2
                if fi in texmap:
                    _, img, uv_src = texmap[fi]
                    bad = None
                    if img not in rects:
                        bad = 'texture file missing from layout'
                    elif len(uv_src) // 2 not in (npts, npts + 1):
                        bad = 'uv/ring length mismatch'
                    elif (len(uv_src) // 2 == npts + 1
                            and uv_src[:2] != uv_src[-2:]):
                        bad = 'closing uv pair != first pair'
                    if bad:
                        unhandled += 1
                        unhandled_detail.append((bi, fi, bad))
                        offset += ntris * 3
                        continue
                    u0, v0, u1, v1 = rects[img]
                    for ti in range(ntris):
                        for k, rj in enumerate((0, ti + 1, ti + 2)):
                            su, sv = uv_src[rj * 2], uv_src[rj * 2 + 1]
                            eu, ev = u0 + su * (u1 - u0), v0 + sv * (v1 - v0)
                            gi = offset + ti * 3 + k
                            au, av = uv[gi * 2], uv[gi * 2 + 1]
                            if au != _f32(eu) or av != _f32(ev):
                                exact_mismatches += 1
                                if len(mismatch_detail) < 5:
                                    mismatch_detail.append(
                                        (bi, fi, gi, (au, av), (eu, ev)))
                            max_err = max(max_err, abs(au - eu), abs(av - ev))
                            if not (0.0 <= au <= 1.0 and 0.0 <= av <= 1.0):
                                out_of_range += 1
                            remapped += 1
                else:
                    no_texture_faces += 1
                    no_tex_buildings[bi] = no_tex_buildings.get(bi, 0) + 1
                    for k in range(ntris * 3):
                        gi = offset + k
                        if uv[gi * 2] != 0.0 or uv[gi * 2 + 1] != 0.0:
                            sentinel_unexpected.append((bi, fi, gi))
                    sentinel_expected += ntris * 3
                offset += ntris * 3
            if offset != vbase + count:
                print(f'FAIL: vertex walk mismatch at building {bi}')
                return 1
        else:
            for k in range(count):
                gi = vbase + k
                if uv[gi * 2] != 0.0 or uv[gi * 2 + 1] != 0.0:
                    sentinel_unexpected.append((bi, 'lod1', gi))
            sentinel_expected += count
        vbase += count
    for gi in range(nverts):
        if uv[gi * 2] == 0.0 and uv[gi * 2 + 1] == 0.0:
            sentinel_found += 1

    report = {
        'checks': checks,
        'geometry_identical': checks['pos_counts_identical_to_regeneration'],
        'buildings': len(data['buildings']),
        'lod2_buildings': len(data['lod2']),
        'verts': nverts,
        'uv_floats': len(uv),
        'verts_remapped': remapped,
        'faces_no_texture': no_texture_faces,
        'no_texture_buildings': no_tex_buildings,
        'faces_unhandled': unhandled,
        'unhandled_detail': unhandled_detail,
        'uv_out_of_range': out_of_range,
        'uv_exact_mismatches': exact_mismatches,
        'mismatch_detail': mismatch_detail,
        'max_abs_err_vs_recomputed_float64': max_err,
        'sentinel_vertices_expected': sentinel_expected,
        'sentinel_vertices_found': sentinel_found,
        'sentinel_unexpected_nonzero': sentinel_unexpected[:5],
        'sentinel_unexpected_count': len(sentinel_unexpected),
    }
    # faces_remapped: counted directly from the intermediate data (the
    # vertex loop above counts remapped vertices, not faces).
    report['faces_remapped'] = sum(
        1 for r in data['lod2'] for fi, (tc, _ring) in enumerate(r['faces'])
        if tc in KEEP_TYPES and fi in {t[0] for t in r['tex']})
    report['faces_kept'] = gen_stats['faces_kept']
    print(json.dumps(report, ensure_ascii=False, indent=1))
    ok = (checks['pos_counts_identical_to_regeneration']
          and checks['counts_sum_is_verts']
          and checks['uv_floats_are_2_per_vertex']
          and checks['atlas_header_layout_sha256_matches']
          and checks['buildings'] == 1443
          and checks['lod2_buildings'] == 800
          and unhandled == 0 and out_of_range == 0
          and exact_mismatches == 0
          and sentinel_expected == sentinel_found
          and not sentinel_unexpected)
    print('VERIFY:', 'PASS' if ok else 'FAIL')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
