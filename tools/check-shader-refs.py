#!/usr/bin/env python3
"""Static check for shader identifier references in onBeforeCompile mods.

GLSL in this codebase lives inside JS string literals injected into
shaders via onBeforeCompile / ShaderMaterial. This script scans the
string literals of src/scripts/*.js (comments are stripped first with a
string-aware state machine) for varying/uniform-style identifiers
(vXxx / uXxx CamelCase tokens). Each referenced identifier must be
either

  * declared in the app's shader strings (a `varying`/`uniform`/
    `attribute` declaration, including precision qualifiers and
    comma-separated declarators), or assigned via
    `shader.uniforms.<name> = ...`, or
  * present as a whole word in the bundled library
    src/assets/three.min.js (i.e. declared by a stock shader chunk of
    the bundled three.js revision).

An identifier in neither set is an unresolved reference: the shader that
uses it fails GLSL compilation in the browser (undeclared identifier)
while every other static check (node --check, structural metrics) still
passes. This is the failure mode of the 2026-11-06 facade fog incident
(R4-5, Issue #121): R3-2 pasted a fog_fragment body that references
`vFogDepth`, but bundled three r128 declares that varying as `fogDepth`,
so the whole integrated building mesh silently stopped rendering and the
failure survived three days of reviews and metrics.

Scope and known limitations:
  * Only vXxx / uXxx CamelCase identifiers are checked. snake_case
    identifiers (e.g. `u_time`), `.replace()` anchor strings and
    `#include` chunk names are out of scope.
  * Only tokens inside string literals are treated as GLSL references;
    tokens in JS code (variables, object keys, property accesses) are
    not shader references in this codebase.
  * The declaration set is shared across files (an app-level
    approximation): a name declared in one file's shader strings also
    resolves references in another file's strings.
  * The comment stripper is not a full JS lexer. A regex literal
    containing a quote or a comment marker would desync it. The only
    regex literals in src/scripts today are the HTML-escape replaces in
    perf-panel.js, which contain neither.

Usage: python3 tools/check-shader-refs.py [--root <repo-root>]
Exit code: 0 = no unresolved references, 1 = unresolved references found.
"""

import argparse
import re
import sys
from bisect import bisect_right
from pathlib import Path

TOKEN_RE = re.compile(r"\b(?:v|u)[A-Z][A-Za-z0-9_]*\b")
DECL_STMT_RE = re.compile(
    r"(?:varying|uniform|attribute)\s+"
    r"(?:(?:highp|mediump|lowp)\s+)?"
    r"[A-Za-z_]\w*(?:\s*\[[^\]]*\])?\s+([^;]+);")
IDENT_RE = re.compile(r"[A-Za-z_]\w*")
UNIFORMS_ASSIGN_RE = re.compile(r"\buniforms\.([A-Za-z_]\w*)\s*=")
ESC_N = chr(92) + "n"  # literal backslash + 'n' as written in JS sources


def strip_comments(text: str):
    """Replace // and /* */ comments with spaces, preserving strings,
    newlines and offsets. Returns (clean_text, string_spans) where
    string_spans are (start, end) offsets of string literals."""
    out = []
    spans = []
    i, n = 0, len(text)
    state = None  # None | quote char | 'line' | 'block'
    span_start = None
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if state is None:
            if ch == "/" and nxt == "/":
                state = "line"
                out.append("  ")
                i += 2
                continue
            if ch == "/" and nxt == "*":
                state = "block"
                out.append("  ")
                i += 2
                continue
            if ch in "'\"`":
                state = ch
                span_start = i
            out.append(ch)
            i += 1
            continue
        if state == "line":
            if ch == "\n":
                state = None
                out.append(ch)
            else:
                out.append(" ")
            i += 1
            continue
        if state == "block":
            if ch == "*" and nxt == "/":
                state = None
                out.append("  ")
                i += 2
                continue
            out.append("\n" if ch == "\n" else " ")
            i += 1
            continue
        # inside a string literal
        out.append(ch)
        if ch == chr(92) and i + 1 < n:
            out.append(text[i + 1])
            i += 2
            continue
        if ch == state:
            spans.append((span_start, i + 1))
            state = None
        i += 1
    return "".join(out), spans


def declared_names(string_contents) -> set:
    names = set()
    for content in string_contents:
        normalized = content.replace(ESC_N, " ")
        for stmt in DECL_STMT_RE.findall(normalized):
            for declarator in stmt.split(","):
                m = IDENT_RE.match(declarator.strip())
                if m:
                    names.add(m.group(0))
    return names


def in_spans(spans, starts, pos) -> bool:
    idx = bisect_right(starts, pos) - 1
    return idx >= 0 and spans[idx][0] <= pos < spans[idx][1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None,
                    help="repo root (default: parent of this script's dir)")
    args = ap.parse_args()
    if args.root:
        root = Path(args.root)
    else:
        root = Path(__file__).resolve().parent.parent

    lib_text = (root / "src" / "assets" / "three.min.js").read_text(
        encoding="utf-8", errors="replace")

    script_files = sorted((root / "src" / "scripts").glob("*.js"))
    if not script_files:
        print(f"no src/scripts/*.js under {root}", file=sys.stderr)
        return 1

    declared: set = set()
    per_file = []
    for path in script_files:
        raw = path.read_text(encoding="utf-8", errors="replace")
        text, spans = strip_comments(raw)
        declared.update(UNIFORMS_ASSIGN_RE.findall(text))
        contents = [text[s:e] for s, e in spans]
        declared.update(declared_names(contents))
        per_file.append((path, text, spans))

    occurrences: dict = {}
    for path, text, spans in per_file:
        starts = [s for s, _ in spans]
        for m in TOKEN_RE.finditer(text):
            if not in_spans(spans, starts, m.start()):
                continue  # JS code, not a GLSL string
            token = m.group(0)
            # Property-style labels ('variation.uOffsets') are not GLSL.
            if m.start() > 0 and text[m.start() - 1] == ".":
                continue
            lineno = text.count(chr(10), 0, m.start()) + 1
            occurrences.setdefault(token, []).append((path.name, lineno))

    lib_cache: dict = {}

    def in_lib(token: str) -> bool:
        if token not in lib_cache:
            pat = re.compile(r"(?<![A-Za-z0-9_$])" + re.escape(token) +
                             r"(?![A-Za-z0-9_$])")
            lib_cache[token] = pat.search(lib_text) is not None
        return lib_cache[token]

    unresolved = [t for t in sorted(occurrences)
                  if t not in declared and not in_lib(t)]

    checked = len(occurrences)
    if unresolved:
        print(f"UNRESOLVED shader identifier references: {len(unresolved)} "
              f"(of {checked} candidate identifiers checked)")
        for token in unresolved:
            spots = ", ".join(f"{f}:{ln}" for f, ln in occurrences[token][:6])
            print(f"  {token}: {spots}")
        return 1
    print(f"OK: {checked} candidate shader identifiers checked, "
          f"0 unresolved references")
    return 0


if __name__ == "__main__":
    sys.exit(main())
