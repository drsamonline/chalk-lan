#!/usr/bin/env python3
"""Draw the platform icons the README and the releases band use, as local SVGs.

GitHub's README cannot inherit a page's CSS, so these carry their own colour —
one green that reads on a light card and on a dark one. The landing page uses
its inline sprite instead, which follows the theme properly.

    python3 scripts/icons.py
"""
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "assets", "icons")

STROKE = "#2e8b63"

ICONS = {
    # name: (title, paths)
    "android": ("Android", [
        "M6 10h12v7a2 2 0 01-2 2H8a2 2 0 01-2-2z",
        "M8 10l-1.5-3M16 10l1.5-3M9 6.5h.01M15 6.5h.01M4 12v4M20 12v4",
    ]),
    "windows": ("Windows", [
        "M4 6.5l7-1v6H4zM12 5.3l8-1.1v7.3h-8zM4 12.5h7v6l-7-1zM12 12.5h8V19l-8-1.1z",
    ]),
    "linux": ("Linux", [
        "M12 3c2.2 0 3 1.8 3 4 0 3 3 4.5 3 8 0 3-2.5 5-6 5s-6-2-6-5c0-3.5 3-5 3-8 0-2.2.8-4 3-4z",
        "M10 14h.01M14 14h.01M10.5 17h3",
    ]),
    "tag": ("Release", [
        "M4 12l8-8h8v8l-8 8z",
        "M16 8a1.4 1.4 0 100 .01",
    ]),
    "chalk": ("Chalk", [
        "M4 20l3-8 9-9 5 5-9 9-8 3z",
        "M14 6l4 4",
    ]),
}


def svg(title, paths):
    body = "".join('<path d="%s"/>' % d for d in paths)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" '
        'role="img" aria-label="%s"><title>%s</title>'
        '<g fill="none" stroke="%s" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">%s</g>'
        "</svg>\n"
    ) % (title, title, STROKE, body)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (title, paths) in ICONS.items():
        path = os.path.join(OUT, name + ".svg")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(svg(title, paths))
        print("wrote docs/assets/icons/%s.svg" % name)


if __name__ == "__main__":
    main()
