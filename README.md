# Chalk

<p>
  <a href="https://drsamonline.github.io/chalk-lan/"><img alt="live: online" src="docs/assets/badge-live.svg"></a>
  <img alt="tests: 50 passing" src="docs/assets/badge-tests.svg">
  <img alt="build: green" src="docs/assets/badge-build.svg">
  <a href="LICENSE"><img alt="licence: PolyForm NC 1.0.0" src="docs/assets/badge-licence.svg"></a>
  <img alt="offline: no network" src="docs/assets/badge-offline.svg">
  <img alt="deps: 0 runtime" src="docs/assets/badge-deps.svg">
</p>

**A shared whiteboard for the room.** Everyone on the same Wi-Fi draws on the same board, live.
No accounts, no internet, no telemetry — the strokes travel across your own network and nowhere else.

**[Open the board →](https://drsamonline.github.io/chalk-lan/play/)** ·
[Landing page](https://drsamonline.github.io/chalk-lan/) ·
[The rule](#what-it-must-not-do-and-does-not) ·
[Releases](#releases) ·
[What's next](#whats-next)

<!-- shot:start -->

![Screenshot](docs/shot.png)

<!-- shot:end -->

One person starts a room on a laptop in the room; everyone else opens the board and joins it. Draw
with a finger or a mouse, pick a colour and a brush, rub things out, undo your last stroke, clear the
board for everyone, and save a PNG of the result. A late joiner is caught up from the host's history
automatically. The app is three local scripts and the host is one small Node file — nothing is
fetched, installed or phoned home.

## What it does

The app is **thin**: storage, languages, theming and accessibility come from **web-kit**; the room —
SSE for server→client, plain POST for client→server, a room code and a LAN URL — comes from
**lan-kit**. The only app-specific code is

- `docs/play/chalk.js` — a small, pure, zero-dependency engine holding the board document, the
  four-message protocol that keeps every device in step (`point`, `stroke`, `undo`, `clear`) and the
  demo scenes the landing page draws. It runs unchanged in the browser and under Node, so the whole
  mechanic is unit-tested headlessly;
- `docs/play/index.html` — the canvas, the toolbar and the join panel, wired to web-kit and lan-kit;
- `host/room.js` + `host/lan-host.js` — the tiny zero-dependency room host, which keeps the last 500
  messages so a late joiner is caught up.

Every message is sanitised on arrival (colour, size and points are validated and clamped, strokes are
bounded at 5000), so a buggy or hostile peer on the LAN cannot break the board.

| | |
|---|---|
| runtime dependencies | **0** |
| headless tests | **50 passing** |
| message types on the wire | **4** — `point`, `stroke`, `undo`, `clear` |
| messages replayed to a late joiner | **500** |
| languages | **3** — English, हिन्दी, ગુજરાતી |

## What it must not do, and does not

- **No internet.** The app is three local scripts; the room is a socket on your own LAN. Unplug the
  WAN cable and the board keeps working.
- **No accounts.** A name for the author label, stored on the device, and nothing else.
- **No server of ours.** The host is a file you run yourself; there is no service to sign up to.
- **No telemetry.** There is no analytics call in this repository to disable.
- **No build step and no packages.** `npm install` is not part of running it.

## What's next

Sixteen enhancements worth building, grouped by where they live. Each one adds no network call and no
third-party code: the engine stays pure JavaScript and every mechanic keeps a headless test.

**On the board**

- **Pressure and nibs** — variable-width strokes from `pointer.pressure` and tilt, with chalk, marker
  and pen nibs. Canvas arithmetic only.
- **Shapes that snap** — hold to straighten a line, then a box, then a circle; snapping and hit-testing
  live in the engine, so they are unit-tested without a browser.
- **Sticky notes and text** — a fifth message type carrying text items. The protocol already ignores
  unknown types, so older clients stay in step instead of crashing.
- **Laser pointer** — a presenter's cursor that is deliberately *not* part of the document: drawn,
  faded after two seconds, never replayed to a late joiner.

**Into the room**

- **Join by room code or QR** — the host already knows its LAN address; print a 4-character code and a
  QR of the join URL in the terminal. `Lan.roomCode()` exists and is unused.
- **Draw through a dropped host** — queue strokes while the room is unreachable and flush on
  reconnect, so a host restart mid-lesson does not lose the board.
- **Snapshot instead of replay** — `toJSON()` already produces a bounded snapshot; send one to a late
  joiner instead of 500 messages, and keep replay for when it is cheaper.
- **Named cursors** — every stroke already carries an author; a faint cursor per author answers "who
  drew that?" at a glance. Same message type, same sanitisation.

**Kept on the device**

- **Save and reopen a board** — `toJSON`/`fromJSON` are written and tested; wire them to a
  `.chalk.json` file so a board survives the tab closing and can be handed on.
- **SVG and PDF export** — `pathOf()` already returns an SVG path per stroke, so a vector export is
  string joining, and print-to-PDF needs no library at all.
- **Autosave in IndexedDB** — `Loom.storage.put` is already in the shared kit: the board comes back
  after a reload with no host and no network anywhere near it.
- **Replay a session** — record the message log with timestamps and play it back like a recording;
  the engine already rebuilds a board from a message list.

**Installed, and for everyone**

- **Installable PWA** — a manifest and a service worker with the HTML network-first and assets
  cache-first (and the cache name bumped every release), so the board opens on a phone that has never
  reached the page before.
- **A single-file board** — inline the three scripts into one HTML file, so a teacher can email the
  whiteboard and it still works from `file://`.
- **Draw with the keyboard** — arrow keys and space to draw, with a visible focus point on the canvas;
  the toolbar is already keyboard-reachable and announced.
- **More languages** — web-kit ships EN, हिन्दी and ગુજરાતી; the app strings are one object per
  language, so Marathi, Bengali and Tamil are a translation, not a refactor.

## Releases

Every push to `main` builds the three downloads below from `docs/play`, publishes the rolling
`app-latest` release and deploys the page — all from the same commit, so the live demo and the
released build cannot disagree.

| | download | what it is |
|---|---|---|
| <img src="docs/assets/icons/android.svg" width="18" height="18" alt=""> **Android** | [chalk-lan.apk](https://github.com/drsamonline/chalk-lan/releases/download/app-latest/chalk-lan.apk) | signed WebView build |
| <img src="docs/assets/icons/windows.svg" width="18" height="18" alt=""> **Windows** | [chalk-lan-portable.exe](https://github.com/drsamonline/chalk-lan/releases/download/app-latest/chalk-lan-portable.exe) | portable, no installer |
| <img src="docs/assets/icons/linux.svg" width="18" height="18" alt=""> **Linux** | [chalk-lan-linux](https://github.com/drsamonline/chalk-lan/releases/download/app-latest/chalk-lan-linux) | single binary |

<img src="docs/assets/icons/tag.svg" width="14" height="14" alt=""> **1.1.0** — 1 November 2026
A landing page of its own, the app moved to `docs/play/`, and three demo scenes drawn by the engine so
the board is never shown empty. The board gained a theme toggle beside its title, a default chalk that
follows the theme, and a build stamp in the footer; the engine grew a pure, tested scene builder, and
the suite went from 38 to 50.

<img src="docs/assets/icons/tag.svg" width="14" height="14" alt=""> **1.0.0** — 25 October 2026
PolyForm Noncommercial 1.0.0 everywhere, stated the same way in the licence, the headers and the
README. A build now fails if the published demo is not the app itself.

<img src="docs/assets/icons/tag.svg" width="14" height="14" alt=""> **0.1.0** — 23 October 2026
First pass: the canvas board, the four-message protocol with sanitisation, the zero-dependency room
host with history replay for late joiners, and the EXE/APK build workflow.

## Run it

**Start the room** (on one machine — a laptop, a Pi, anything with Node):

```bash
node host/room.js                 # room "chalk", port 8080
```

It prints the address to use on the LAN, for example `http://192.168.1.20:8080`.

**Join the board** — open the published page on any device on the same Wi-Fi:

- **https://drsamonline.github.io/chalk-lan/** → *Open the board*, then paste the host address and tap
  **Join room**;

or run it locally: open `docs/play/index.html` in a browser (the engine `chalk.js`, the transport
`lan-kit.js` and the shared runtime `web-kit.js` sit next to it, so it works from `file://` too).

```bash
node test-node.js      # 50 passed, 0 failed
```

`?demo=lesson|erase|join` opens the board on a demo scene, and `?theme=dark|light` pins the look for
that visit without writing the choice to storage — both are how the screenshots and the landing page's
frame are made.

## Layout

```
docs/index.html         the landing page
docs/play/index.html    the app — the canvas, the toolbar, the join panel
docs/play/chalk.js      the engine: the document, the protocol, the demo scenes
docs/play/web-kit.js    shared runtime: storage, i18n, theme, a11y, ui
docs/play/lan-kit.js    the LAN room transport
docs/assets/            screenshots, generated badges and icons
host/room.js            the room host you run
host/lan-host.js        SSE down, POST up, history for late joiners
scripts/badges.py       draws docs/assets/badge-*.svg and checks each claim
scripts/icons.py        draws docs/assets/icons/*.svg
scripts/shot.sh         screenshots the landing page and the app
test-node.js            the headless suite
```

The badges and the icons are **generated, not fetched** — an offline-first board that needs the
network to describe itself would have broken its own rule.

## Licence

PolyForm Noncommercial License 1.0.0 — see [LICENSE](LICENSE). The required notice is the first line
of it. © 2026 Dr Sohil Momin. Part of the Forge system — apps open, orchestrator licensed.
