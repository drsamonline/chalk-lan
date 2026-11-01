#!/usr/bin/env node
/* room.js — run a Chalk room host on your LAN. Zero dependencies.
 *
 *   node host/room.js                          # room "chalk", port 8080
 *   node host/room.js --room canteen --port 8080
 *   node host/room.js --no-qr                  # skip the QR in the terminal
 *
 * The host serves the board itself, so the address it prints is the whole
 * instruction: open it on any device on the same Wi-Fi, or scan the QR code and
 * you are on the shared board with the room already joined. Nothing leaves the
 * network. A late joiner gets one snapshot of the board, not the whole history.
 *
 * PolyForm Noncommercial License 1.0.0. (c) 2026 Dr Sohil Momin. Part of the Forge system.
 */
"use strict";
const os = require("os");
const path = require("path");
const { createHost } = require("./lan-host.js");
const QR = require(path.join(__dirname, "..", "docs", "play", "qr.js"));

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.indexOf("--" + name) !== -1; }

const room = arg("room", "chalk");
const port = parseInt(arg("port", "8080"), 10);

function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((a) => {
      if (a.family === "IPv4" && !a.internal) out.push({ name, address: a.address });
    });
  });
  return out;
}

(async function () {
  const host = createHost({
    room: room,
    code: arg("code", undefined),
    history: 500,
    snapshot: true,
    static: path.join(__dirname, "..", "docs", "play")
  });
  const bound = await host.listen(port);
  const addrs = lanAddresses();
  const first = addrs.length ? "http://" + addrs[0].address + ":" + bound : "http://localhost:" + bound;

  console.log("");
  console.log("  Chalk — a shared whiteboard for the room");
  console.log("  ─────────────────────────────────────────");
  console.log("  room   " + host.room + "        code  " + host.code);
  console.log("  on this machine   http://localhost:" + bound);
  addrs.forEach((a) => {
    console.log("  on the LAN        http://" + a.address + ":" + bound + "   (" + a.name + ")");
  });
  console.log("");
  console.log("  Open that address on any device on this Wi-Fi — or scan:");
  console.log("");

  if (!flag("no-qr")) {
    try {
      const lines = QR.ascii(first, { quiet: 1 }).split("\n");
      lines.forEach((l) => console.log("    " + l));
    } catch (e) {
      console.log("    (no QR: " + e.message + ")");
    }
  }

  console.log("");
  console.log("  Everyone who opens it is on the same board. Ctrl-C to stop.");
  console.log("");

  host.onMessage((m) => {
    if (!m) return;
    if (m.t === "clear" || m.t === "undo" || m.t === "note") {
      console.log("  " + String(m.t).padEnd(6) + " " + (m.author || "?") +
        (m.id ? "  " + m.id : "") + "   (clients: " + host.clients() + ")");
    }
  });

  process.on("SIGINT", async function () {
    console.log("\n  closing the room…");
    await host.close();
    process.exit(0);
  });
})();
