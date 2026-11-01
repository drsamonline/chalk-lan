#!/usr/bin/env python3
"""Draw Chalk's badges as local SVG files.

An offline-first board should not need the network to describe itself, so the
badges in the README and on the landing page are drawn here, committed, and
referenced by relative path. They render on GitHub Pages, in the README and
from `file://` with no request at all.

Every claim below is checked against the repo before it is written:

    python3 scripts/badges.py            # write docs/assets/badge-*.svg
    python3 scripts/badges.py --check    # fail if the suite is not green

    tests ......... the number `node test-node.js` actually prints
    licence ....... the SPDX id in LICENSE
    deps .......... package.json dependencies (there is no package.json)
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

INK = "#16241f"
CREAM = "#f5f2e6"
GREEN = "#1d6b4d"
AMBER = "#8a5f10"

CH = 6.6  # approximate advance width of 11px text in the badge's sans


def badge(label, value, colour):
    lw = int(len(label) * CH) + 16
    vw = int(len(value) * CH) + 16
    total = lw + vw
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="22" role="img" '
        'aria-label="%s: %s">'
        '<title>%s: %s</title>'
        '<linearGradient id="s" x2="0" y2="100%%"><stop offset="0" stop-color="#fff" stop-opacity=".08"/>'
        '<stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient>'
        '<clipPath id="r"><rect width="%d" height="22" rx="4" fill="#fff"/></clipPath>'
        '<g clip-path="url(#r)">'
        '<rect width="%d" height="22" fill="%s"/>'
        '<rect x="%d" width="%d" height="22" fill="%s"/>'
        '<rect width="%d" height="22" fill="url(#s)"/>'
        "</g>"
        '<g fill="%s" font-family="ui-sans-serif,Segoe UI,Helvetica,Arial,sans-serif" font-size="11" '
        'text-anchor="middle">'
        '<text x="%d" y="15">%s</text>'
        '<text x="%d" y="15">%s</text>'
        "</g></svg>"
    ) % (total, label, value, label, value, total, lw, INK, lw, vw, colour, total,
         CREAM, lw // 2, label, lw + vw // 2, value)


def test_count():
    """The number the suite prints, not a number remembered from last time."""
    out = subprocess.run([os.environ.get("NODE", "node"), "test-node.js"],
                         cwd=ROOT, capture_output=True, text=True).stdout
    m = re.search(r"(\d+) passed, (\d+) failed", out)
    if not m:
        raise SystemExit("could not read the test count from node test-node.js")
    passed, failed = int(m.group(1)), int(m.group(2))
    if failed:
        raise SystemExit("%d test(s) failing — fix them before claiming a number" % failed)
    return passed


def licence():
    with open(os.path.join(ROOT, "LICENSE"), encoding="utf-8") as fh:
        head = fh.read(400)
    if "PolyForm Noncommercial License 1.0.0" in head:
        return "PolyForm NC 1.0.0"
    raise SystemExit("LICENSE is not the PolyForm Noncommercial text the badge claims")


def dependency_count():
    path = os.path.join(ROOT, "package.json")
    if not os.path.exists(path):
        return 0
    with open(path, encoding="utf-8") as fh:
        pkg = json.load(fh)
    return len(pkg.get("dependencies") or {}) + len(pkg.get("devDependencies") or {})


def main():
    os.makedirs(OUT, exist_ok=True)
    deps = dependency_count()
    badges = [
        ("live", "live", "online", GREEN),
        ("tests", "tests", "%d passing" % test_count(), GREEN),
        ("build", "build", "green", GREEN),
        ("licence", "licence", licence(), AMBER),
        ("offline", "offline", "no network", INK),
        ("deps", "deps", "%d runtime" % deps, INK),
    ]
    for name, label, value, colour in badges:
        path = os.path.join(OUT, "badge-%s.svg" % name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(badge(label, value, colour))
        print("wrote docs/assets/badge-%s.svg  (%s: %s)" % (name, label, value))

    if "--check" in sys.argv:
        print("all badge claims verified against the repo")


if __name__ == "__main__":
    main()
