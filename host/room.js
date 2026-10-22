#!/usr/bin/env node
/* room.js — run a Chalk room host on your LAN. Zero dependencies.
 *
 *   node host/room.js                       # room "chalk", port 8080
 *   node host/room.js --room canteen --port 8080
 *
 * Then open the Chalk board (GitHub Pages, or docs/play/index.html) on every
 * device in the room and enter this host's address. The host keeps the last 500
 * messages, so a late joiner is caught up automatically.
 *
 * MIT License. (c) 2026 Dr Sohil Momin. Part of the Forge system.
 */
"use strict";
const os = require("os");
const { createHost } = require("./lan-host.js");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

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
  const host = createHost({ room: room, history: 500, replay: true });
  const bound = await host.listen(port);

  console.log("Chalk room host");
  console.log("  room:  " + room);
  console.log("  on this machine:  http://localhost:" + bound);
  lanAddresses().forEach((a) => {
    console.log("  on the LAN (" + a.name + "):  http://" + a.address + ":" + bound);
  });
  console.log("\nOpen the Chalk board on every device and enter the LAN address above.");
  console.log("Ctrl-C to stop.\n");

  host.onMessage((m) => {
    if (m && (m.t === "clear" || m.t === "undo")) {
      console.log("  " + m.t + (m.id ? " " + m.id : "") + "  (clients: " + host.clients() + ")");
    }
  });
})();
