#!/usr/bin/env python3
"""PLATEAU-CITY v1 JSON -> CITYGEO-style hero data (window.CITYGEO_HERO).

Formalized in Bolt 第4回 (Issue #151 / #146) for the R5-P morning preview.
Input: the combined intermediate JSON produced by tools/convert-plateau.py
(hero meshes 52350421 + 52350422, "PLATEAU-CITY v1").
Output: src/data/citygeo-hero.js:
    window.CITYGEO_HERO = { pos: '<base64 Int16 dm>', counts: '<base64 Uint32>' };
The format mirrors src/data/citygeo.js (window.CITYGEO) exactly, so the
#140 integration only has to swap the data object (and the matching
window.CITY_HERO buildings array, see docs/plateau-hero-data.md).

Generation rules (see docs/plateau-hero-data.md for the measured values):
  - Buildings are emitted in the intermediate JSON order; counts has one
    entry per building, in the same order.
  - Non-LOD2 buildings: LOD1 extrusion identical in structure to the
    current citygeo.js: walls first (2 triangles per footprint edge,
    6n vertices), then the roof (earcut triangulation of the footprint,
    n-2 triangles). Wall winding follows the footprint signed area so
    walls face outward (verified against the current data: the area rule
    agrees with an independent ray-casting outward test on 9,079/9,079
    current buildings; the stored data itself deviates on 48 buildings,
    whose walls face inward there).
  - LOD2 buildings: every kept lod2Solid face is fan-triangulated
    (n-2 triangles per face) in the raw GML ring order. The raw ring
    orientation is used as-is: a signed-volume test over all 800 LOD2
    solids (divergence theorem, Ground faces included) gives a total
    of 8.26e9 dm^3 with raw orientation, against 2.42e9 dm^3 when
    flipping faces by a footprint-centroid test and 5.24e9 dm^3 when
    flipping by a ray-cast probe test, and 799/800 solids have
    positive volume raw. Both flip heuristics were tried and rejected
    on this evidence: the footprint centroid is a bad reference for
    LOD2 solids (it can sit outside the solid, and sloped roofs tilt
    the test), and the ray-cast probe starts off the face surface for
    non-planar or concave faces. One building (index 1148) has a
    negative raw volume (-186,100 dm^3, near the negative of its
    footprint-area x height); it is flagged in docs/plateau-hero-data.md
    as a source-data anomaly for #140, not repaired here.
  - Face types kept: Wall (0), Roof (1), Ceiling (3). Ground (2) is
    excluded: all 800 Ground faces sit at z_rel = 0 (the building
    underside at baseZ), face downward and are never visible from
    outside; the LOD1 extrusion has no bottom face either. Floor (4),
    Closure (5) and other (9) do not occur in the hero meshes.
  - pos triplets are (x_dm, z_abs_dm, -north_dm): z is the ABSOLUTE
    elevation, baseZ_dm + z_rel_dm. All values must fit Int16
    (checked; hero ranges are far inside).
  - The roof triangulation is a faithful port of the earcut algorithm
    as vendored in three.js r128 (THREE.ShapeUtils.triangulateShape),
    which is what generated the current citygeo.js roofs: the port
    reproduces three.js r128 output order-exactly on 9,079/9,079
    current footprints (verified in docs/plateau-hero-data.md).
  - Determinism: pure Python stdlib, no timestamps, no randomness,
    no dict/set iteration over unordered data. Re-running the same
    command produces byte-identical output (SHA-256 verified).

Usage:
    python3 tools/build-citygeo-hero.py plateau-city-hero.json -o src/data/citygeo-hero.js
"""
import argparse
import base64
import json
import struct
import sys

# ---------------------------------------------------------------------------
# Earcut triangulation (faithful port of mapbox earcut 2.2.x as vendored in
# three.js r128, THREE.ShapeUtils.triangulateShape). No holes are used here:
# footprints and LOD2 faces are simple polygons, so eliminateHoles is
# omitted and hole_indices must be empty.
# ---------------------------------------------------------------------------

class _Node:
    __slots__ = ('i', 'x', 'y', 'prev', 'next', 'z', 'prevZ', 'nextZ', 'steiner')

    def __init__(self, i, x, y):
        self.i = i
        self.x = x
        self.y = y
        self.prev = None
        self.next = None
        self.z = 0
        self.prevZ = None
        self.nextZ = None
        self.steiner = False


def _area(p, q, r):
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)


def _equals(a, b):
    return a.x == b.x and a.y == b.y


def _sign(num):
    return 1 if num > 0 else (-1 if num < 0 else 0)


def _signed_area(data, start, end, dim):
    total = 0
    j = end - dim
    i = start
    while i < end:
        total += (data[j] - data[i]) * (data[i + 1] + data[j + 1])
        j = i
        i += dim
    return total


def _insert_node(i, x, y, last):
    p = _Node(i, x, y)
    if last is None:
        p.prev = p
        p.next = p
    else:
        p.next = last.next
        p.prev = last
        last.next.prev = p
        last.next = p
    return p


def _remove_node(p):
    p.next.prev = p.prev
    p.prev.next = p.next
    if p.prevZ is not None:
        p.prevZ.nextZ = p.nextZ
    if p.nextZ is not None:
        p.nextZ.prevZ = p.prevZ


def _linked_list(data, start, end, dim, clockwise):
    last = None
    if clockwise == (_signed_area(data, start, end, dim) > 0):
        i = start
        while i < end:
            last = _insert_node(i, data[i], data[i + 1], last)
            i += dim
    else:
        i = end - dim
        while i >= start:
            last = _insert_node(i, data[i], data[i + 1], last)
            i -= dim
    if last is not None and _equals(last, last.next):
        _remove_node(last)
        last = last.next
    return last


def _filter_points(start, end=None):
    if start is None:
        return start
    if end is None:
        end = start
    p = start
    while True:
        again = False
        if not p.steiner and (_equals(p, p.next) or _area(p.prev, p, p.next) == 0):
            _remove_node(p)
            p = end = p.prev
            if p is p.next:
                break
            again = True
        else:
            p = p.next
        if not (again or p is not end):
            break
    return end


def _point_in_triangle(ax, ay, bx, by, cx, cy, px, py):
    return ((cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 and
            (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 and
            (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0)


def _is_ear(ear):
    a = ear.prev
    b = ear
    c = ear.next
    if _area(a, b, c) >= 0:
        return False  # reflex, so ears must be clockwise
    p = ear.next.next
    while p is not ear.prev:
        if (_point_in_triangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) and
                _area(p.prev, p, p.next) >= 0):
            return False
        p = p.next
    return True


def _int32(v):
    v = int(v)
    v %= 2 ** 32
    if v >= 2 ** 31:
        v -= 2 ** 32
    return v


def _z_curve(x, y, min_x, min_y, inv_size):
    x = _int32((x - min_x) * inv_size)
    y = _int32((y - min_y) * inv_size)
    x = (x | (x << 8)) & 0x00FF00FF
    x = (x | (x << 4)) & 0x0F0F0F0F
    x = (x | (x << 2)) & 0x33333333
    x = (x | (x << 1)) & 0x55555555
    y = (y | (y << 8)) & 0x00FF00FF
    y = (y | (y << 4)) & 0x0F0F0F0F
    y = (y | (y << 2)) & 0x33333333
    y = (y | (y << 1)) & 0x55555555
    return x | (y << 1)


def _sort_linked(head):
    in_size = 1
    while True:
        p = head
        head = None
        tail = None
        num_merges = 0
        while p is not None:
            num_merges += 1
            q = p
            p_size = 0
            for _ in range(in_size):
                if q is None:
                    break
                p_size += 1
                q = q.nextZ
            q_size = in_size
            while p_size > 0 and q_size > 0 and q is not None:
                if p.z <= q.z:
                    e = p
                    p = p.nextZ
                    p_size -= 1
                else:
                    e = q
                    q = q.nextZ
                    q_size -= 1
                if tail is not None:
                    tail.nextZ = e
                else:
                    head = e
                e.prevZ = tail
                tail = e
            p = q
            while p_size > 0 and p is not None:
                e = p
                p = p.nextZ
                p_size -= 1
                if tail is not None:
                    tail.nextZ = e
                else:
                    head = e
                e.prevZ = tail
                tail = e
            while q_size > 0 and q is not None:
                e = q
                q = q.nextZ
                q_size -= 1
                if tail is not None:
                    tail.nextZ = e
                else:
                    head = e
                e.prevZ = tail
                tail = e
        tail.nextZ = None
        in_size *= 2
        if num_merges <= 1:
            break
    return head


def _index_curve(start, min_x, min_y, inv_size):
    p = start
    while True:
        if p.z == 0:
            p.z = _z_curve(p.x, p.y, min_x, min_y, inv_size)
        p.prevZ = p.prev
        p.nextZ = p.next
        p = p.next
        if p is start:
            break
    p.prevZ.nextZ = None
    p.prevZ = None
    _sort_linked(p)


def _is_ear_hashed(ear, min_x, min_y, inv_size):
    a = ear.prev
    b = ear
    c = ear.next
    if _area(a, b, c) >= 0:
        return False  # reflex, so ears must be clockwise
    min_tx = min(a.x, b.x, c.x)
    min_ty = min(a.y, b.y, c.y)
    max_tx = max(a.x, b.x, c.x)
    max_ty = max(a.y, b.y, c.y)
    min_z = _z_curve(min_tx, min_ty, min_x, min_y, inv_size)
    max_z = _z_curve(max_tx, max_ty, min_x, min_y, inv_size)
    p = ear.prevZ
    n = ear.nextZ
    while p is not None and p.z >= min_z and n is not None and n.z <= max_z:
        if (p is not ear.prev and p is not ear.next and
                _point_in_triangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) and
                _area(p.prev, p, p.next) >= 0):
            return False
        p = p.prevZ
        if (n is not ear.prev and n is not ear.next and
                _point_in_triangle(a.x, a.y, b.x, b.y, c.x, c.y, n.x, n.y) and
                _area(n.prev, n, n.next) >= 0):
            return False
        n = n.nextZ
    while p is not None and p.z >= min_z:
        if (p is not ear.prev and p is not ear.next and
                _point_in_triangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) and
                _area(p.prev, p, p.next) >= 0):
            return False
        p = p.prevZ
    while n is not None and n.z <= max_z:
        if (n is not ear.prev and n is not ear.next and
                _point_in_triangle(a.x, a.y, b.x, b.y, c.x, c.y, n.x, n.y) and
                _area(n.prev, n, n.next) >= 0):
            return False
        n = n.nextZ
    return True


def _intersects(p1, q1, p2, q2):
    o1 = _sign(_area(p1, q1, p2))
    o2 = _sign(_area(p1, q1, q2))
    o3 = _sign(_area(p2, q2, p1))
    o4 = _sign(_area(p2, q2, q1))
    if o1 != o2 and o3 != o4:
        return True
    return False


def _locally_inside(a, b):
    if _area(a.prev, a, a.next) < 0:
        return _area(a, b, a.next) >= 0 and _area(a, a.prev, b) >= 0
    return _area(a, b, a.prev) < 0 or _area(a, a.next, b) < 0


def _intersects_polygon(a, b):
    p = a
    while True:
        if (p.i != a.i and p.next.i != a.i and p.i != b.i and p.next.i != b.i and
                _intersects(p, p.next, a, b)):
            return True
        p = p.next
        if p is a:
            break
    return False


def _middle_inside(a, b):
    # midpoint of diagonal a-b inside the polygon (ray casting on the ring)
    mx = (a.x + b.x) / 2.0
    my = (a.y + b.y) / 2.0
    inside = False
    p = a
    while True:
        x1, y1 = p.x, p.y
        x2, y2 = p.next.x, p.next.y
        if (y1 > my) != (y2 > my):
            xin = (x2 - x1) * (my - y1) / (y2 - y1) + x1
            if mx < xin:
                inside = not inside
        p = p.next
        if p is a:
            break
    return inside


def _is_valid_diagonal(a, b):
    return (a.next.i != b.i and a.prev.i != b.i and
            not _intersects_polygon(a, b) and
            _locally_inside(a, b) and _locally_inside(b, a) and
            _middle_inside(a, b))


def _split_polygon(a, b):
    a2 = _Node(a.i, a.x, a.y)
    b2 = _Node(b.i, b.x, b.y)
    an = a.next
    bp = b.prev
    a.next = b
    b.prev = a
    a2.next = an
    an.prev = a2
    b2.next = a2
    a2.prev = b2
    bp.next = b2
    b2.prev = bp
    return b2


def _cure_local_intersections(start, triangles, dim):
    p = start
    while True:
        a = p.prev
        b = p.next.next
        if (not _equals(a, b) and _intersects(a, p, p.next, b) and
                _locally_inside(a, b) and _locally_inside(b, a)):
            triangles.append(a.i // dim)
            triangles.append(p.i // dim)
            triangles.append(b.i // dim)
            _remove_node(p)
            _remove_node(p.next)
            p = start = b
        p = p.next
        if p is start:
            break
    return _filter_points(p)


def _split_earcut(start, triangles, dim, min_x, min_y, inv_size):
    a = start
    while True:
        b = a.next.next
        while b is not a.prev:
            if a.i != b.i and _is_valid_diagonal(a, b):
                c = _split_polygon(a, b)
                _earcut_linked(a, triangles, dim, min_x, min_y, inv_size, 0)
                _earcut_linked(c, triangles, dim, min_x, min_y, inv_size, 0)
                return
            b = b.next
        a = a.next
        if a is start:
            break


def _earcut_linked(ear, triangles, dim, min_x, min_y, inv_size, pass_):
    if ear is None:
        return
    if not pass_ and inv_size:
        _index_curve(ear, min_x, min_y, inv_size)
    stop = ear
    while ear.prev is not ear.next:
        prev = ear.prev
        nxt = ear.next
        if ( _is_ear_hashed(ear, min_x, min_y, inv_size) if inv_size
                else _is_ear(ear)):
            triangles.append(prev.i // dim)
            triangles.append(ear.i // dim)
            triangles.append(nxt.i // dim)
            _remove_node(ear)
            ear = nxt.next
            stop = nxt.next
            continue
        ear = nxt
        if ear is stop:
            if not pass_:
                _earcut_linked(_filter_points(ear), triangles, dim,
                               min_x, min_y, inv_size, 1)
            elif pass_ == 1:
                ear = _cure_local_intersections(_filter_points(ear), triangles, dim)
                _earcut_linked(ear, triangles, dim, min_x, min_y, inv_size, 2)
            elif pass_ == 2:
                _split_earcut(ear, triangles, dim, min_x, min_y, inv_size)
            break


def earcut(data, dim=2):
    """Triangulate a simple polygon given as flat [x0, y0, x1, y1, ...].

    Returns a flat list of vertex indices, 3 per triangle, in the same
    order three.js r128 THREE.ShapeUtils.triangulateShape returns them
    for the same contour. No holes are supported (hole_indices empty).
    """
    outer_len = len(data)
    outer_node = _linked_list(data, 0, outer_len, dim, True)
    triangles = []
    if outer_node is None or outer_node.next is outer_node.prev:
        return triangles
    min_x = min_y = inv_size = None
    if len(data) > 80 * dim:
        min_x = max_x = data[0]
        min_y = max_y = data[1]
        for i in range(dim, outer_len, dim):
            x = data[i]
            y = data[i + 1]
            if x < min_x:
                min_x = x
            if y < min_y:
                min_y = y
            if x > max_x:
                max_x = x
            if y > max_y:
                max_y = y
        inv_size = max(max_x - min_x, max_y - min_y)
        inv_size = 32767 / inv_size if inv_size != 0 else 0
    _earcut_linked(outer_node, triangles, dim, min_x, min_y, inv_size, 0)
    return triangles


# ---------------------------------------------------------------------------
# LOD1 extrusion (same structure as current citygeo.js)
# ---------------------------------------------------------------------------

def _ring_area2(pts):
    a = 0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return a


def extrude_lod1(footprint, h_dm, base_z_dm):
    """footprint: flat [x_dm, north_dm, ...]; returns list of (x, y, z) int dm
    triplets, walls first (6n vertices), then the roof at y = base_z + h."""
    n = len(footprint) // 2
    pts = [(footprint[i * 2], footprint[i * 2 + 1]) for i in range(n)]
    y0 = base_z_dm
    y1 = base_z_dm + h_dm
    # wall winding: pattern 1 (A0,B0,B1),(A0,B1,A1) when the ring is CCW in
    # (x, north), pattern 2 otherwise; both make walls face outward.
    ccw = _ring_area2(pts) > 0
    out = []
    for i in range(n):
        ax, an = pts[i]
        bx, bn = pts[(i + 1) % n]
        A0 = (ax, y0, -an)
        B0 = (bx, y0, -bn)
        A1 = (ax, y1, -an)
        B1 = (bx, y1, -bn)
        if ccw:
            out += [A0, B0, B1, A0, B1, A1]
        else:
            out += [A0, B1, B0, A0, A1, B1]
    flat = []
    for (x, north) in pts:
        flat += [x, north]
    tris = earcut(flat, 2)
    for t in range(0, len(tris), 3):
        for k in (tris[t], tris[t + 1], tris[t + 2]):
            x, north = pts[k]
            out.append((x, y1, -north))
    return out


# ---------------------------------------------------------------------------
# LOD2 fan triangulation (raw GML ring order; see header for the evidence)
# ---------------------------------------------------------------------------

def _newell_normal(ring3):
    nx = ny = nz = 0.0
    n = len(ring3)
    for i in range(n):
        x1, y1, z1 = ring3[i]
        x2, y2, z2 = ring3[(i + 1) % n]
        nx += (y1 - y2) * (z1 + z2)
        ny += (z1 - z2) * (x1 + x2)
        nz += (x1 - x2) * (y1 + y2)
    return (nx, ny, nz)


def fan_lod2_faces(faces, base_z_dm, kept_types=(0, 1, 3)):
    """faces: [[type_code, [x, north, z_rel, ...]], ...] (z relative to baseZ).
    Returns (triangles, stats): triangles are (x, y, z) int dm triplets with
    y = baseZ + z_rel (absolute elevation); stats counts kept/skipped faces.
    Ground (2) is excluded by kept_types. Rings are fan-triangulated
    (v0, vi, vi+1) in their stored order; no per-face flipping (the
    signed-volume test in docs/plateau-hero-data.md shows the stored
    orientation is the outward one)."""
    kept = [(tc, ring) for (tc, ring) in faces if tc in kept_types]
    stats = {'faces_kept': len(kept),
             'faces_skipped': len(faces) - len(kept),
             'flipped': 0, 'degenerate': 0}
    out = []
    for (tc, ring) in kept:
        pts = [(ring[i], base_z_dm + ring[i + 2], -ring[i + 1])
               for i in range(0, len(ring), 3)]
        nv = _newell_normal(pts)
        if abs(nv[0]) < 1e-9 and abs(nv[1]) < 1e-9 and abs(nv[2]) < 1e-9:
            stats['degenerate'] += 1
        for i in range(1, len(pts) - 1):
            out.append((pts[0], pts[i], pts[i + 1]))
    return out, stats


# ---------------------------------------------------------------------------
# CITYGEO assembly
# ---------------------------------------------------------------------------

KEEP_TYPES = (0, 1, 3)  # Wall, Roof, Ceiling; Ground (2) excluded (see header)


def build_hero(data):
    pos = []
    counts = []
    stats = {'lod1_buildings': 0, 'lod2_buildings': 0,
             'lod1_tris': 0, 'lod2_tris': 0,
             'faces_kept': 0, 'faces_skipped': 0, 'faces_flipped': 0,
             'faces_degenerate': 0,
             'min_x': None, 'max_x': None, 'min_y': None, 'max_y': None,
             'min_z': None, 'max_z': None}
    lod2_by_b = {r['b']: r for r in data['lod2']}
    for bi, b in enumerate(data['buildings']):
        h_dm, _usage, fp, lod2_idx, base_z = b
        if bi in lod2_by_b:
            tris, fs = fan_lod2_faces(lod2_by_b[bi]['faces'], base_z, KEEP_TYPES)
            stats['lod2_buildings'] += 1
            stats['lod2_tris'] += len(tris)
            stats['faces_kept'] += fs['faces_kept']
            stats['faces_skipped'] += fs['faces_skipped']
            stats['faces_flipped'] += fs['flipped']
            stats['faces_degenerate'] += fs['degenerate']
            verts = [v for tri in tris for v in tri]
        else:
            verts = extrude_lod1(fp, h_dm, base_z)
            stats['lod1_buildings'] += 1
            stats['lod1_tris'] += len(verts) // 3
        counts.append(len(verts))
        for (x, y, z) in verts:
            if x < -32768 or x > 32767 or y < -32768 or y > 32767 or z < -32768 or z > 32767:
                raise SystemExit(f'Int16 overflow at building {bi}: {(x, y, z)}')
            pos += [x, y, z]
            if stats['min_x'] is None or x < stats['min_x']:
                stats['min_x'] = x
            if stats['max_x'] is None or x > stats['max_x']:
                stats['max_x'] = x
            if stats['min_y'] is None or y < stats['min_y']:
                stats['min_y'] = y
            if stats['max_y'] is None or y > stats['max_y']:
                stats['max_y'] = y
            if stats['min_z'] is None or z < stats['min_z']:
                stats['min_z'] = z
            if stats['max_z'] is None or z > stats['max_z']:
                stats['max_z'] = z
    stats['buildings'] = len(data['buildings'])
    stats['verts'] = len(pos) // 3
    stats['tris'] = len(pos) // 9
    return pos, counts, stats


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('input', help='PLATEAU-CITY v1 JSON (combined hero meshes)')
    ap.add_argument('-o', '--out', required=True, help='output citygeo-hero.js path')
    args = ap.parse_args(argv)
    with open(args.input, encoding='utf-8') as f:
        data = json.load(f)
    if data.get('format') != 'PLATEAU-CITY v1':
        raise SystemExit(f"unexpected format: {data.get('format')!r}")
    pos, counts, stats = build_hero(data)
    pos_b64 = base64.b64encode(struct.pack('<%dh' % len(pos), *pos)).decode()
    cnt_b64 = base64.b64encode(struct.pack('<%dI' % len(counts), *counts)).decode()
    js = ("window.CITYGEO_HERO = { pos: '%s', counts: '%s' };\n" % (pos_b64, cnt_b64))
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(js)
    stats['pos_b64_bytes'] = len(pos_b64)
    stats['counts_b64_bytes'] = len(cnt_b64)
    stats['js_bytes'] = len(js.encode('utf-8'))
    print(json.dumps(stats, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
