#!/usr/bin/env python3
"""Build the single-file index.html from the split sources in src/.

Canonical source: src/ (see docs/build.md). The repository-root index.html
is a generated file and must never be edited by hand.

Usage:
    python3 tools/build.py build [--out PATH]
        Assemble src/ into the distribution form: the two external
        scripts in src/assets/ are inlined as base64 data URIs.
        Default output is the repository-root index.html.

    python3 tools/build.py verify [--expected-git-blob SHA]
        Build twice in memory, check the two outputs are byte-identical
        (determinism), and compare the result with the index.html on
        disk. Optionally also compare its git blob id with SHA.

    python3 tools/build.py artifact --out PATH
        Assemble src/ into the artifact (builder) form: the same single
        file, but the two asset scripts stay as external references
        (``assets/three.min.js`` / ``assets/city.js``). This is the form
        to copy back to the artifact working copy before publishing.

    python3 tools/build.py split --from PATH --assets DIR
        Regenerate src/ from an artifact-form index.html (PATH) and its
        assets directory (DIR, containing three.min.js and city.js).
        The split is verified before returning: rebuilding from the
        regenerated src/ must reproduce both the artifact form and the
        distribution form derived from the input byte for byte.

Only the Python standard library is used. No randomness, no timestamps,
no network access: the same src/ always builds the same index.html.
"""

import argparse
import base64
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
TEMPLATE = SRC / "template.html"

INCLUDE_RE = re.compile(rb"<!-- @include ([A-Za-z0-9_./-]+) -->")
ASSET_LINE_RE = re.compile(rb"^<!-- @script-asset ([A-Za-z0-9_./-]+) -->$")

# Split layout, in document order. Each entry maps one block of the
# artifact-form file to one file under src/.
WEBFONT = "scripts/webfont.js"
STYLE = "style.css"
CITYGEO = "data/citygeo.js"
MAIN_SCRIPTS = [
    "scripts/build-city.js",
    "scripts/pigeons.js",
    "scripts/simulation.js",
    "scripts/perf-panel.js",
]
ASSETS = ["assets/three.min.js", "assets/city.js"]

SCRIPT_OPEN = b"    <script>"
SCRIPT_CLOSE = b"    </script>"
STYLE_OPEN = b"    <style>"
STYLE_CLOSE = b"    </style>"
CITYGEO_PREFIX = b"    <script>window.CITYGEO = "


def read_part(rel):
    data = (SRC / rel).read_bytes()
    if b"@include" in data or b"@script-asset" in data:
        raise SystemExit(f"part file must not contain build tokens: src/{rel}")
    return data


def strip_one_trailing_newline(data):
    if data.endswith(b"\n"):
        return data[:-1]
    return data


def build_bytes(mode):
    """Assemble src/ and return the bytes of the single HTML file.

    mode is "dist" (assets inlined as base64 data URIs) or "artifact"
    (assets referenced as external files).
    """
    if mode not in ("dist", "artifact"):
        raise ValueError(mode)
    out_lines = []
    for line in TEMPLATE.read_bytes().split(b"\n"):
        asset = ASSET_LINE_RE.match(line.strip())
        if asset:
            rel = asset.group(1).decode()
            if rel not in ASSETS:
                raise SystemExit(f"unknown asset in template: {rel}")
            if mode == "dist":
                b64 = base64.b64encode((SRC / rel).read_bytes())
                out_lines.append(
                    b'    <script src="data:application/javascript;base64,'
                    + b64
                    + b'"></script>'
                )
            else:
                out_lines.append(
                    b'    <script src="' + rel.encode() + b'"></script>'
                )
            continue

        def replace(match):
            rel = match.group(1).decode()
            return strip_one_trailing_newline(read_part(rel))

        out_lines.append(INCLUDE_RE.sub(replace, line))
    return b"\n".join(out_lines)


def git_blob_id(data):
    header = b"blob " + str(len(data)).encode() + b"\x00"
    return hashlib.sha1(header + data).hexdigest()


def describe(data):
    return (
        f"{len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()}, "
        f"git blob {git_blob_id(data)}"
    )


def cmd_build(args):
    data = build_bytes("dist")
    out = Path(args.out) if args.out else ROOT / "index.html"
    out.write_bytes(data)
    print(f"built {out}: {describe(data)}")
    return 0


def cmd_verify(args):
    first = build_bytes("dist")
    second = build_bytes("dist")
    if first != second:
        print("FAIL: two builds from the same src/ differ", file=sys.stderr)
        return 1
    print(f"determinism: two builds are byte-identical ({describe(first)})")
    on_disk = ROOT / "index.html"
    if on_disk.exists():
        disk = on_disk.read_bytes()
        if disk != first:
            print(
                "FAIL: index.html on disk differs from a fresh build",
                file=sys.stderr,
            )
            print(f"  disk:  {describe(disk)}", file=sys.stderr)
            print(f"  built: {describe(first)}", file=sys.stderr)
            return 1
        print("index.html on disk matches a fresh build byte for byte")
    if args.expected_git_blob:
        actual = git_blob_id(first)
        if actual != args.expected_git_blob:
            print(
                f"FAIL: git blob {actual} != expected {args.expected_git_blob}",
                file=sys.stderr,
            )
            return 1
        print(f"git blob matches the expected value {actual}")
    print("verify: PASS")
    return 0


def cmd_artifact(args):
    data = build_bytes("artifact")
    out = Path(args.out)
    out.write_bytes(data)
    print(f"built artifact form {out}: {describe(data)}")
    return 0


def extract_block(lines, start, close_line, what):
    """Return (content_lines, index_of_close_line) for a block.

    ``start`` is the index just after the opening line.
    """
    for idx in range(start, len(lines)):
        if lines[idx] == close_line:
            return lines[start:idx], idx
    raise SystemExit(f"split: closing line for {what} not found")


def write_part(rel, content_lines):
    path = SRC / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\n".join(content_lines) + b"\n")
    print(f"  src/{rel}: {len(content_lines)} lines")


def cmd_split(args):
    source = Path(args.from_file).read_bytes()
    assets_dir = Path(args.assets)
    lines = source.split(b"\n")

    template = []
    idx = 0
    scripts_seen = 0
    style_seen = False
    citygeo_seen = False
    assets_seen = []

    while idx < len(lines):
        line = lines[idx]
        if line == SCRIPT_OPEN and scripts_seen == 0:
            content, close_idx = extract_block(
                lines, idx + 1, SCRIPT_CLOSE, "webfont script"
            )
            write_part(WEBFONT, content)
            template += [line, b"<!-- @include " + WEBFONT.encode() + b" -->",
                         SCRIPT_CLOSE]
            idx = close_idx + 1
            scripts_seen += 1
        elif line == STYLE_OPEN and not style_seen:
            content, close_idx = extract_block(
                lines, idx + 1, STYLE_CLOSE, "style"
            )
            write_part(STYLE, content)
            template += [line, b"<!-- @include " + STYLE.encode() + b" -->",
                         STYLE_CLOSE]
            idx = close_idx + 1
            style_seen = True
        elif line in (
            b'    <script src="assets/three.min.js"></script>',
            b'    <script src="assets/city.js"></script>',
        ):
            rel = line.split(b'"')[1].decode()
            assets_seen.append(rel)
            template.append(b"<!-- @script-asset " + rel.encode() + b" -->")
            idx += 1
        elif line.startswith(CITYGEO_PREFIX) and line.endswith(b"</script>"):
            inner = line[len(b"    <script>"):-len(b"</script>")]
            write_part(CITYGEO, [inner])
            template.append(
                b"    <script><!-- @include " + CITYGEO.encode()
                + b" --></script>"
            )
            idx += 1
            citygeo_seen = True
        elif line == SCRIPT_OPEN and 1 <= scripts_seen <= len(MAIN_SCRIPTS):
            rel = MAIN_SCRIPTS[scripts_seen - 1]
            content, close_idx = extract_block(
                lines, idx + 1, SCRIPT_CLOSE, rel
            )
            write_part(rel, content)
            template += [line, b"<!-- @include " + rel.encode() + b" -->",
                         SCRIPT_CLOSE]
            idx = close_idx + 1
            scripts_seen += 1
        else:
            template.append(line)
            idx += 1

    if scripts_seen != 1 + len(MAIN_SCRIPTS):
        raise SystemExit(
            f"split: expected {1 + len(MAIN_SCRIPTS)} script blocks, "
            f"found {scripts_seen}"
        )
    if not style_seen:
        raise SystemExit("split: style block not found")
    if not citygeo_seen:
        raise SystemExit("split: CITYGEO line not found")
    if assets_seen != ASSETS:
        raise SystemExit(f"split: expected assets {ASSETS}, found {assets_seen}")

    for rel in ASSETS:
        data = (assets_dir / Path(rel).name).read_bytes()
        dest = SRC / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        print(f"  src/{rel}: {len(data)} bytes (copied)")

    SRC.mkdir(parents=True, exist_ok=True)
    TEMPLATE.write_bytes(b"\n".join(template))
    print(f"  src/template.html: {len(template)} lines")

    artifact = build_bytes("artifact")
    if artifact != source:
        raise SystemExit(
            "split: FAIL - artifact form rebuilt from src/ differs from "
            "the input file"
        )
    print("split: artifact form rebuilt from src/ is byte-identical "
          "to the input")
    dist = build_bytes("dist")
    print(f"split: distribution form is {describe(dist)}")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("build")
    p.add_argument("--out")
    p.set_defaults(func=cmd_build)

    p = sub.add_parser("verify")
    p.add_argument("--expected-git-blob")
    p.set_defaults(func=cmd_verify)

    p = sub.add_parser("artifact")
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_artifact)

    p = sub.add_parser("split")
    p.add_argument("--from", dest="from_file", required=True)
    p.add_argument("--assets", required=True)
    p.set_defaults(func=cmd_split)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
