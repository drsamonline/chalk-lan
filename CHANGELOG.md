# Changelog

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
