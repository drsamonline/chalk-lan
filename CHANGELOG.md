# Changelog

## 2.0.0 — 2026-11-01

Every enhancement the README listed is now built, and none of them costs a
network call or a dependency. The engine is still pure and still tested headlessly.

**On the board**

- **Pressure and nibs.** A point carries its pressure, and three nibs shape it: chalk is soft and
  pressure-led, a marker is flat, a pen is thin and crisp.
- **Shapes that snap.** Line, box and circle drag out as a preview and commit as one stroke on release;
  `Chalk.shapePoints` draws them and the corners overshoot the way a hand does.
- **Sticky notes.** A fifth message type carries text items; notes move and edit by id.
- **Laser pointer.** A cursor message that is drawn, fades, and is never stored in the document.
- **Backgrounds.** Plain, dotted paper, a grid, or a blackboard — drawn on the canvas, no image fetched.
- **Chalk sets.** Default, Okabe–Ito colour-safe, and high contrast, chosen in the toolbar.
- **Undo anyone.** A mode where clicking a stroke or a note removes it, using the engine's new
  segment-aware hit test.

**Into the room**

- **Join by QR or code.** The host now serves the board itself, so the QR it prints lands a phone on the
  shared board with the room already joined; the room code is shown beside the status dot.
- **Find a room.** `Lan.scan()` probes the device's own /24 for a Chalk host — no DNS, no internet.
- **Snapshot instead of replay.** A late joiner gets one `snapshot` message rebuilt through the engine,
  not 500 replayed messages.
- **Draw through a dropped host.** Messages that fail to send are queued and flushed in order on
  reconnect.
- **Named cursors.** Every author's pointer is drawn with their name and fades on its own.
- **Several boards in one room.** Every message carries a board id, and the engine ignores other boards.

**Kept on the device**

- **Save and reopen.** `.chalk.json` out and in, through the tested codec.
- **SVG and PDF.** A vector export (`Chalk.toSVG`) and print-to-PDF, both offline.
- **Autosave.** The board is written to IndexedDB and comes back after a reload.
- **Replay a session.** Record the message log, then play it back with the gaps squeezed.

**Installed, and for everyone**

- **PWA.** A manifest and a service worker: HTML network-first, assets cache-first, cache name bumped
  per release, so a new build is never hidden behind the old one.
- **A single-file board.** `scripts/bundle.py` inlines everything into
  `docs/play/chalk-single.html` — one file to email.
- **Keyboard drawing.** Arrows move the point, space starts and ends a stroke, and the point is visible.
- **Six languages.** English, हिन्दी, ગુજરાતી, मराठी, বাংলা and தமிழ்.
- **A verified QR encoder.** `docs/play/qr.js` is a zero-dependency encoder; every test string is
  decoded back with two independent decoders before release, and the host prints one in the terminal.

Tests went from 50 to 127: the engine suite plus a host suite that speaks to a real server over HTTP.

## 1.1.1 — 2026-11-01

- **The landing page no longer advertises the roadmap.** A page that sells the board should not read
  as a to-do list, so the "What's next" band is gone from `docs/index.html`; the enhancements — now
  twenty-one, with backgrounds and layers, a colour-blind-safe chalk set, host discovery by name,
  several boards in one room and undo-anyone added — live in the README only.
- **The colour swatches show their colours again.** The app's theme block ends with
  `button:not(.ghost):not(.tab){background:var(--acc)!important}`, which painted every swatch the accent
  colour, so seven chalks looked like one. The rule now skips `.swatch`, and the first swatch — the
  board's own ink — reads correctly on both boards.

## 1.1.0 — 2026-11-01

- **A landing page of its own.** `docs/index.html` is now a designed page in a palette and type the
  app never uses — a chalkboard on paper, serif display, green board bands — with the real app embedded
  in a browser frame and three guided scenes. The app moved to `docs/play/`; the build workflow already
  pointed there.
- **Demo scenes in the engine.** `Chalk.scenes` / `Chalk.scene(name, w, h)` build a whole board from
  pure data — a worked problem annotated by three people, an eraser before-and-after, and an untouched
  board. They are laid out in fractions and scaled at paint time, so the demo fits a 430px phone and a
  1280px laptop, and they are tested headlessly. Suite: 38 → 50 passing.
- **A board that opens with something on it.** `?demo=lesson|erase|join` opens the app on a scene, and
  `?theme=dark|light` pins the look for that visit without writing the choice to storage.
- **Theme toggle beside the title,** and the default chalk now follows the board: `Chalk.DEFAULT_COLOR`
  renders as the board's own ink, so it is chalk-white on the dark board and near-black on the light
  one. The first swatch is that ink, and it is rebuilt when the theme changes.
- **A build stamp in the footer** — app version, engine version and the date the page was served — so
  "am I on the new one?" is answerable from the page itself.
- **Local badges, local icons, local screenshots.** `scripts/badges.py` draws the six badges and refuses
  to write a test count the suite does not print; `scripts/icons.py` draws the platform and release
  icons; `scripts/shot.sh` takes the four screenshots. No image service is referenced anywhere.
- **The licence is stated once, the same way, everywhere.** `chalk.js` said MIT in its header while
  LICENSE, the app footer and the README said PolyForm Noncommercial 1.0.0; the header now agrees.
- **The icon is the board's, not the old page's** — chalkboard green, chalk white, with a green stroke
  under the nib.

## 1.0.0 — 2026-10-25

- **Licence: PolyForm Noncommercial 1.0.0.** Every repository now carries the canonical text
  from polyformproject.org with the Required Notice line, and the four places a repo states
  its licence agree: LICENSE, the SPDX headers, the README and package.json.
- **The public demo is the app.** A build now fails if `docs/play/index.html` is not the app,
  because a demo running older code is two code paths for one program.


## 0.1.0 — 2026-10-23

- First pass. The shared room whiteboard: a canvas board that every device on the
  same Wi-Fi draws on, live.
- Engine (`docs/play/chalk.js`): the board document and a four-message protocol
  (`point`, `stroke`, `undo`, `clear`), pure and zero-dependency, with colour,
  size and point sanitisation and a size-bounded snapshot (`toJSON`/`fromJSON`).
- Single-page app (`docs/play/index.html`) thin on **web-kit** (storage, EN/HI/GU,
  theme, a11y, ui) and **lan-kit** (the LAN room transport), plus a zero-dependency
  room host (`host/room.js`) that replays history to late joiners.
- Headless tests for the engine plus a live-stream integration check:
  38 passed, 0 failed.
- Build workflow for the portable EXE and Android APK.
