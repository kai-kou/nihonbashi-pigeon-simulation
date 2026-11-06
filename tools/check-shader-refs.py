#!/usr/bin/env python3
"""Static check for shader identifier references in onBeforeCompile mods.

GLSL in this codebase lives inside JS string literals injected into
shaders via onBeforeCompile / ShaderMaterial. This script scans
src/scripts/*.js (comments stripped with a string-aware state machine)
for varying/uniform-style identifiers (vXxx / uXxx tokens). Each
identifier must be either

  * declared by the app itself (a `varying`/`uniform`/`attribute`
    declaration in the shader strings, or a `shader.uniforms.<name>`
    assignment), or
  * present in the bundled library src/assets/three.min.js (i.e. declared
    by a stock shader chunk of the bundled three.js revision).

Identifiers that are declared as plain JS variables / parameters /
object keys in the same file are excluded (they are not GLSL references;
in this codebase GLSL identifiers never double as JS variables).

An identifier in none of these sets is an unresolved reference: the
shader that uses it fails GLSL compilation in the browser (undeclared
identifier) while every other static check (node --check, structural
metrics) still passes. This is the failure mode of the 2026-11-06 facade
fog incident (R4-5, Issue #121): R3-2 pasted a fog_fragment body that
references `vFogDepth`, but bundled three r128 declares that varying as
`fogDepth`, so the whole integrated building mesh silently stopped
rendering and the failure survived three days of reviews and metrics.

Known limitation: the comment stripper is not a full JS lexer. A regex
literal containing a quote or a comment marker would desync it. The only
regex literals in src/scripts today are the HTML-escape replaces in
perf-panel.js, which contain neither.

Usage: python3 tools/check-shader-refs.py [--root <repo-root>]
Exit code: 0 = no unresolved references, 1 = unresolved references found.
"""

import argparse
import re
import sys
from pathlib import Path

TOKEN_RE = re.compile(r"\b(?:v|u)[A-Z][A-Za-z0-9_]*\b")
DECL_RE = re.compile(r"(?:varying|uniform|attribute)\s+\w+\s+([A-Za-z_]\w*)")
UNIFORMS_ASSIGN_RE = re.compile(r"\buniforms\.([A-Za-z_]\w*)\s*=")
JS_VAR_RE = re.compile(r"\b(?:const|let|var)\s+([A-Za-z_]\w*)")
JS_PARAM_RES = [
    re.compile(r"\bfunction\s*\w*\s*\(([^)]*)\)"),
    re.compile(r"\(([^()]*)\)\s*=>"),
    re.compile(r"\b([A-Za-z_]\w*)\s*=>"),
]
JS_KEY_RE = re.compile(r"[{,]\s*([A-Za-z_]\w*)\s*:")
ESC_N = chr(92) + "n"  # literal backslash + 'n' as written in JS sources


def strip_comments(text: str) -> str:
    """Replace // and /* */ comments with spaces, preserving strings
    and newlines (so line numbers stay stable)."""
    out = []
    i, n = 0, len(text)
    state = None  # None | "'" | '"' | '`' | 'line' | 'block'
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
            state = None
        i += 1
    return "".join(out)


def js_declared(text: str) -> set:
    names = set(JS_VAR_RE.findall(text))
    names.update(m.group(1) for m in JS_KEY_RE.finditer(text))
    for rx in JS_PARAM_RES:
        for params in rx.findall(text):
            for p in params.split(","):
                p = p.strip().split("=")[0].strip()
                if re.fullmatch(r"[A-Za-z_]\w*", p):
                    names.add(p)
    return names


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
    occurrences: dict = {}
    for path in script_files:
        raw = path.read_text(encoding="utf-8", errors="replace")
        text = strip_comments(raw)
        declared.update(UNIFORMS_ASSIGN_RE.findall(text))
        declared.update(DECL_RE.findall(text.replace(ESC_N, " ")))
        local_js = js_declared(text)
        for lineno, line in enumerate(text.splitlines(), start=1):
            for m in TOKEN_RE.finditer(line):
                token = m.group(0)
                if token in local_js:
                    continue
                # Property accesses (obj.uOff, 'variation.uOffsets') are
                # JS, not GLSL references. GLSL field swizzles in this
                # codebase are lowercase (.x/.xyz), never vXxx/uXxx.
                if m.start() > 0 and line[m.start() - 1] == ".":
                    continue
                occurrences.setdefault(token, []).append((path.name, lineno))

    unresolved = [t for t in sorted(occurrences)
                  if t not in declared and t not in lib_text]

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
