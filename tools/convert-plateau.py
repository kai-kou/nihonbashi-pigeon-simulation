#!/usr/bin/env python3
"""PLATEAU CityGML (Osaka 2025, EPSG:6697) -> compact local dataset.

Formalized from the R5-2 prototype (Bolt 第4回, Issue #151 / #146).
Input: one or more bldg GML files (one mesh each). Output: a single JSON
file in format "PLATEAU-CITY v1":

  origin: [lat0, lon0]  (Osaka Castle keep, approx.)
  buildings: [ [h_dm, usage_code, [x_dm, north_dm, ...], lod2_index|-1, baseZ_dm], ... ]
      - same conventions as current window.CITY buildings[0..2]:
        height in decimetres, footprint as flat int dm pairs (x=east, north)
      - lod2_index / baseZ_dm are appended fields (current code reads [0] and [2] only)
  lod2: [ {b: building_index,
           faces: [ [type_code, [x_dm, north_dm, z_dm_rel, ...] flat ring], ... ],
           tex:   [ [face_index, texture_file, [u, v, ...]], ... ]}, ... ]
      - face ring vertices are int dm, z relative to the building base (ground) z
      - type_code: 0=Wall 1=Roof 2=Ground 3=Ceiling 4=Floor 5=Closure 9=other
  meshes: [ {mesh, buildings, lod2_buildings, lod2_faces, dropped_no_height,
             h_derived, fp_source}, ... ]  (one entry per input file, in order)

Coordinate conversion: equirectangular around origin, standard metres-per-degree
formulae evaluated at lat0. Sentinel heights (-9999 / 9999 / <=0 / missing) fall
back to the lod1Solid z-range; buildings with no derivable height are dropped
and counted in dropped_no_height (0 is required for the hero meshes).
Base z is min z over GroundSurface polys, else min z over the lod1Solid
(footprint solid); fallback 0 only when neither exists. Self-check: per-mesh
stats record the baseZ source (ground polys / lod1Solid / fallback 0) and flag
baseZ values that disagree with lod1Solid zmin by more than 0.5 m, and baseZ=0
buildings whose lod1Solid zmin is positive (Bolt 第4回 proposal 3).

Determinism: the output depends only on the input files and their order.
No timestamps, no randomness, no dict/set iteration over unordered data:
ElementTree iterparse order and dict insertion order are input order.
Re-running the same command produces byte-identical output (verified by
SHA-256 in docs/plateau-hero-data.md).

Usage:
    python3 tools/convert-plateau.py --gml 52350421_bldg.gml --gml 52350422_bldg.gml \
        --out plateau-city-hero.json
    python3 tools/convert-plateau.py 52350421_bldg.gml -o plateau-52350421.json

Changes from the prototype (proto/convert_proto.py):
  - Output format label is "PLATEAU-CITY v1" (was "PLATEAU-CITY v1 (prototype)").
    This is the only byte difference on the 52350421 re-run.
  - Multi-mesh input: several GML files are concatenated into one JSON,
    with lod2 building indices re-based per mesh; per-mesh stats are kept
    under "meshes".
  - argparse CLI (was positional sys.argv); dead code removed.
  - Conversion logic, coordinate formulae, footprint priority, sentinel
    handling and JSON layout are unchanged from the prototype.
"""
import argparse
import json
import math
import sys
import time
import xml.etree.ElementTree as ET

NS = {
    'core': 'http://www.opengis.net/citygml/2.0',
    'bldg': 'http://www.opengis.net/citygml/building/2.0',
    'gml': 'http://www.opengis.net/gml',
    'app': 'http://www.opengis.net/citygml/appearance/2.0',
    'xlink': 'http://www.w3.org/1999/xlink',
}
FORMAT = 'PLATEAU-CITY v1'
LAT0, LON0 = 34.687315, 135.526201  # Osaka Castle keep (approx.)
phi = math.radians(LAT0)
M_LAT = 111132.954 - 559.822 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)   # m per deg lat
M_LON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)                 # m per deg lon


def to_dm(lat, lon):
    return (round((lon - LON0) * M_LON * 10), round((lat - LAT0) * M_LAT * 10))


def parse_poslist(text):
    v = [float(t) for t in text.split()]
    return [(v[i], v[i + 1], v[i + 2]) for i in range(0, len(v) - 2, 3)]


TYPE_CODE = {'WallSurface': 0, 'RoofSurface': 1, 'GroundSurface': 2, 'OuterCeilingSurface': 3,
             'OuterFloorSurface': 4, 'ClosureSurface': 5, 'BuildingFurniture': 9}


def ring_area2(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i][0], pts[i][1]
        x2, y2 = pts[(i + 1) % len(pts)][0], pts[(i + 1) % len(pts)][1]
        a += x1 * y2 - x2 * y1
    return abs(a)


def convert(path):
    surf_tex = {}   # polygon id -> (image basename, [uv floats])
    buildings = []
    lod2 = []
    stats = {'dropped_no_height': 0, 'fp_source': {}, 'h_derived': 0, 'sentinel_h': 0}
    context = ET.iterparse(path, events=('end',))
    for event, elem in context:
        tag = elem.tag
        if tag == f"{{{NS['app']}}}ParameterizedTexture":
            img_el = elem.find('app:imageURI', NS)
            img = (img_el.text or '').strip().split('/')[-1] if img_el is not None else ''
            for target in elem.findall('app:target', NS):
                uri = target.get('uri', '')
                sid = uri.lstrip('#')
                tc = target.find('app:TexCoordList/app:textureCoordinates', NS)
                uv = []
                if tc is not None and tc.text:
                    uv = [round(float(t), 4) for t in tc.text.split()]
                if sid:
                    surf_tex[sid] = (img, uv)
            elem.clear()
        elif tag == f"{{{NS['bldg']}}}Building":
            b = parse_building(elem, surf_tex, stats)
            if b is not None:
                buildings.append(b[0])
                if b[1] is not None:
                    b[1]['b'] = len(buildings) - 1
                    lod2.append(b[1])
            elem.clear()
    return buildings, lod2, stats


def parse_building(elem, surf_tex, stats):
    def txt(path):
        e = elem.find(path, NS)
        return e.text.strip() if e is not None and e.text else None

    usage_raw = txt('bldg:usage')
    usage = int(usage_raw) if usage_raw and usage_raw.lstrip('-').isdigit() else -1
    h = None
    mh = txt('bldg:measuredHeight')
    if mh:
        try:
            hv = float(mh)
            if hv <= 0 or hv >= 9999 or hv == -9999:
                stats['sentinel_h'] += 1
            else:
                h = hv
        except ValueError:
            pass
    # polygons of this building: id -> (type_code, [(lat,lon,z)...])
    polys = {}
    for surf in elem.iter():
        tcode = None
        stag = surf.tag.split('}')[-1]
        if stag in TYPE_CODE:
            tcode = TYPE_CODE[stag]
            for poly in surf.iter(f"{{{NS['gml']}}}Polygon"):
                pid = poly.get(f"{{{NS['gml']}}}id")
                ring_el = poly.find('gml:exterior/gml:LinearRing/gml:posList', NS)
                if pid and ring_el is not None and ring_el.text:
                    polys[pid] = (tcode, parse_poslist(ring_el.text))
    # footprint: lod0FootPrint > lod0RoofEdge > GroundSurface ring (largest)
    fp_pts = None
    src = None
    for cand, sname in (('bldg:lod0FootPrint', 'lod0FootPrint'), ('bldg:lod0RoofEdge', 'lod0RoofEdge')):
        el = elem.find(cand, NS)
        if el is not None:
            best = None
            for ring_el in el.iter(f"{{{NS['gml']}}}LinearRing"):
                pl = ring_el.find('gml:posList', NS)
                if pl is not None and pl.text:
                    pts = parse_poslist(pl.text)
                    if best is None or ring_area2(pts) > ring_area2(best):
                        best = pts
            if best:
                fp_pts, src = best, sname
                break
    if fp_pts is None:
        gs = [v for v in polys.values() if v[0] == 2]
        if gs:
            fp_pts = max((v[1] for v in gs), key=ring_area2)
            src = 'GroundSurface'
    if fp_pts is None:
        return None
    stats['fp_source'][src] = stats['fp_source'].get(src, 0) + 1
    # base z: min z over ground polys, else min over footprint solid; fallback 0
    base_z = None
    gs = [v for v in polys.values() if v[0] == 2]
    if gs:
        base_z = min(p[2] for _, pts in gs for p in pts)
    # lod1Solid z range, read unconditionally: it is the base_z fallback for
    # LOD1-only buildings (no GroundSurface polys) even when measuredHeight
    # is valid, and the height fallback when h is missing. (Was: read only
    # inside `if h is None:`, so measuredHeight-valid LOD1-only buildings
    # kept base_z None -> 0.0. Fixed in Bolt 第4回 fix-up, 2026-11-11.)
    lod1_zmin = lod1_zmax = None
    el = elem.find('bldg:lod1Solid', NS)
    if el is not None:
        zs = []
        for pl in el.iter(f"{{{NS['gml']}}}posList"):
            if pl.text:
                zs += parse_poslist(pl.text)
        if zs:
            lod1_zmin = min(p[2] for p in zs)
            lod1_zmax = max(p[2] for p in zs)
    if base_z is None and lod1_zmin is not None:
        base_z = lod1_zmin
        stats['basez_from_lod1'] = stats.get('basez_from_lod1', 0) + 1
    # height fallback from lod1Solid z range (h derivation unchanged)
    if h is None:
        if lod1_zmin is not None and lod1_zmax is not None and lod1_zmax > lod1_zmin:
            h = lod1_zmax - lod1_zmin
            stats['h_derived'] += 1
    if h is None or h <= 0:
        stats['dropped_no_height'] += 1
        return None
    if base_z is None:
        base_z = 0.0
        stats['basez_fallback0'] = stats.get('basez_fallback0', 0) + 1
    # self-check (proposal 3, Bolt 第4回): baseZ must agree with lod1Solid
    # zmin within 0.5 m where both exist, and a baseZ of 0 with a positive
    # lod1Solid zmin is flagged (the old fallback-bug pattern).
    if lod1_zmin is not None and abs(base_z - lod1_zmin) > 0.5:
        stats['basez_lod1_mismatch'] = stats.get('basez_lod1_mismatch', 0) + 1
    if base_z == 0.0:
        stats['basez_zero'] = stats.get('basez_zero', 0) + 1
        if lod1_zmin is not None and lod1_zmin > 0.5:
            stats['basez_zero_lod1_positive'] = stats.get('basez_zero_lod1_positive', 0) + 1
    # footprint to dm, drop closing duplicate
    fp = []
    pts2 = [(p[0], p[1]) for p in fp_pts]
    if len(pts2) > 1 and pts2[0] == pts2[-1]:
        pts2 = pts2[:-1]
    for lat, lon in pts2:
        x, n = to_dm(lat, lon)
        fp += [x, n]
    rec = [round(h * 10), usage, fp, -1, round(base_z * 10)]
    # LOD2
    lod2_rec = None
    solid = elem.find('bldg:lod2Solid', NS)
    if solid is not None:
        faces = []
        tex = []
        for sm in solid.iter(f"{{{NS['gml']}}}surfaceMember"):
            href = sm.get(f"{{{NS['xlink']}}}href", '')
            pid = href.lstrip('#')
            if pid in polys:
                tcode, pts = polys[pid]
                ring = []
                pp = pts[:-1] if len(pts) > 1 and pts[0] == pts[-1] else pts
                for lat, lon, z in pp:
                    x, n = to_dm(lat, lon)
                    ring += [x, n, round((z - base_z) * 10)]
                faces.append([tcode, ring])
                if pid in surf_tex:
                    img, uv = surf_tex[pid]
                    tex.append([len(faces) - 1, img, uv])
        if faces:
            lod2_rec = {'b': -1, 'faces': faces, 'tex': tex}
            rec[3] = -2  # placeholder, fixed by caller via lod2 order
    return rec, lod2_rec


def mesh_name(path):
    base = path.rsplit('/', 1)[-1]
    return base.split('_')[0] if '_' in base else base.rsplit('.', 1)[0]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('gml', nargs='*', help='bldg GML file(s), one mesh each')
    ap.add_argument('--gml', dest='gml_opt', action='append', default=[],
                    help='bldg GML file (repeatable, same as positional)')
    ap.add_argument('-o', '--out', required=True, help='output JSON path')
    args = ap.parse_args(argv)
    paths = list(args.gml) + list(args.gml_opt)
    if not paths:
        ap.error('at least one GML file is required')
    t0 = time.time()
    all_buildings, all_lod2, meshes = [], [], []
    for path in paths:
        buildings, lod2, stats = convert(path)
        base = len(all_buildings)
        lod2_base = len(all_lod2)
        for j, rec in enumerate(lod2):
            rec['b'] += base
            buildings[rec['b'] - base][3] = lod2_base + j
        all_buildings.extend(buildings)
        all_lod2.extend(lod2)
        meshes.append({'mesh': mesh_name(path),
                       'buildings': len(buildings),
                       'lod2_buildings': len(lod2),
                       'lod2_faces': sum(len(r['faces']) for r in lod2),
                       'lod2_tex_faces': sum(len(r['tex']) for r in lod2),
                       'dropped_no_height': stats['dropped_no_height'],
                       'h_derived': stats['h_derived'],
                       'sentinel_h': stats['sentinel_h'],
                       'basez_from_lod1': stats.get('basez_from_lod1', 0),
                       'basez_fallback0': stats.get('basez_fallback0', 0),
                       'basez_zero': stats.get('basez_zero', 0),
                       'basez_lod1_mismatch': stats.get('basez_lod1_mismatch', 0),
                       'basez_zero_lod1_positive': stats.get('basez_zero_lod1_positive', 0),
                       'fp_source': stats['fp_source']})
    for m in meshes:
        if m['basez_lod1_mismatch'] or m['basez_zero_lod1_positive']:
            print(f"WARNING {m['mesh']}: baseZ self-check failed "
                  f"(mismatch={m['basez_lod1_mismatch']}, "
                  f"zero_with_positive_lod1={m['basez_zero_lod1_positive']})",
                  file=sys.stderr)
    for b in all_buildings:
        if b[3] == -2:
            b[3] = -1
    data = {'format': FORMAT, 'origin': [LAT0, LON0],
            'm_per_deg': [round(M_LAT, 3), round(M_LON, 3)],
            'meshes': meshes,
            'buildings': all_buildings, 'lod2': all_lod2}
    js = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(js)
    stats_out = {'meshes': meshes,
                 'buildings': len(all_buildings),
                 'lod2_buildings': len(all_lod2),
                 'lod2_faces': sum(len(r['faces']) for r in all_lod2),
                 'lod2_tex_faces': sum(len(r['tex']) for r in all_lod2),
                 'json_bytes': len(js.encode('utf-8')),
                 'elapsed_s': round(time.time() - t0, 1)}
    print(json.dumps(stats_out, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
