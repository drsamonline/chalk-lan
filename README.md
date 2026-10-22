# Chalk

[![live](https://img.shields.io/badge/live-online-22c55e)](https://drsamonline.github.io/chalk-lan/)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![tests](https://img.shields.io/badge/tests-38%20passed-22c55e)](test-node.js)
[![release](https://img.shields.io/github/v/release/drsamonline/chalk-lan)](https://github.com/drsamonline/chalk-lan/releases)

**A shared whiteboard for the room.** Everyone on the same Wi-Fi draws on the
same board, live. No accounts, no internet, no telemetry — the strokes travel
across your own network and nowhere else.

Built with **Forge**, thin on two shared kits: **web-kit** (storage, i18n
EN/HI/GU, theme, a11y, ui) and **lan-kit** (the LAN room transport).

## What it does

One person starts a room on a laptop in the room; everyone else opens the board
and joins it. Draw with a finger or a mouse, pick a colour and a brush, rub
things out, undo your last stroke, clear the board for everyone, and save a PNG
of the result. A late joiner is caught up from the host's history automatically.

## Run it

**Start the room** (on one machine — a laptop, a Pi, anything with Node):

```
node host/room.js                 # room "chalk", port 8080
```

It prints the address to use on the LAN, for example `http://192.168.1.20:8080`.

**Join the board** — open the published page on any device on the same Wi-Fi:

- **https://drsamonline.github.io/chalk-lan/** → *Open the board*, then paste the
  host address and tap **Join room**;

or run it locally: open `docs/play/index.html` in a browser (the engine
`docs/play/chalk.js`, the transport `docs/play/lan-kit.js` and the shared runtime
`docs/play/web-kit.js` sit next to it, so it works from `file://` too).

```
node test-node.js      # 38 passed, 0 failed
```

## How it is built

The app is **thin**: storage, languages, theming and accessibility come from
**web-kit**; the room — SSE for server→client, plain POST for client→server, a
room code and a LAN URL — comes from **lan-kit**. The only app-specific code is

- `docs/play/chalk.js` — a small, pure, zero-dependency engine holding the board
  document and the four-message protocol that keeps every device in step
  (`point`, `stroke`, `undo`, `clear`). It runs unchanged in the browser and under
  Node, so the whole mechanic is unit-tested headlessly;
- `docs/play/index.html` — the canvas, the toolbar and the join panel, wired to
  web-kit and lan-kit;
- `host/room.js` + `host/lan-host.js` — the tiny zero-dependency room host.

Every message is sanitised on arrival (colour, size and points are validated and
clamped), so a buggy or hostile peer on the LAN cannot break the board.

## Build the EXE and APK

This repo calls the shared build workflow. On every push, GitHub Actions builds a
portable Windows EXE and a signed Android APK from `docs/play` and attaches them
to the `app-latest` release.

## Licence

MIT. (c) 2026 Dr Sohil Momin. Part of the Forge system — apps open, orchestrator licensed.
