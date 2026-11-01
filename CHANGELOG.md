# Changelog

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
