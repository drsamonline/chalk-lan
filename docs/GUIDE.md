# Chalk — running a shared board

**Version 2.0.1 · PolyForm Noncommercial 1.0.0**

A shared whiteboard for a room's own Wi-Fi. Storage, languages, theming and accessibility come from
**web-kit**; the room — server-sent events for server→client, plain POST for client→server, a room
code, a snapshot for late joiners — comes from **lan-kit**. The app's own code is the board engine,
the canvas and a QR encoder.

| | |
|---|---|
| runtime dependencies | **0** |
| tests | **127 passing** — 115 engine, 12 host |
| message types on the wire | **7** — `point`, `stroke`, `note`, `undo`, `clear`, `cursor`, `snapshot` |
| languages | **6** — English, हिन्दी, ગુજરાતી, मराठी, বাংলা, தமிழ் |

## Joining a room

Open the board, then either type the **room code** or **point a phone at the QR** the host shows —
the encoder is in the app, so a room can be joined from a terminal without anyone typing a URL.

A late joiner gets **one snapshot message**, not a replay of every stroke since the room opened.

## What it will not do

- **No internet.** The app is four local scripts and the room is a socket on your own LAN. Unplug the
  WAN cable and the board keeps working.
- **No accounts.** A name for the author label, stored on the device, and nothing else.
- **No server of ours.** The host is a file you run yourself; there is nothing to sign up to.
- **No telemetry.** There is no analytics call in this repository to disable.
- **No build step and no packages.** `npm install` is not part of running it.

## On a hostile peer

Every message is sanitised on arrival — colour, size, text and points are validated and clamped, and
strokes are bounded at 5,000 points. A buggy or hostile peer on the LAN cannot break the board. That
matters more on a shared network than on the internet, where you would at least know who you were
talking to.

## Licence

PolyForm Noncommercial 1.0.0. See [LICENSE](../LICENSE).
