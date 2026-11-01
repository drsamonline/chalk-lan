/* lan-host.js — the tiny LAN host for drsamonline apps. Zero dependencies.
 *
 * A local HTTP server that gives a room a real-time channel with no framework
 * and no WebSocket library: server -> clients over Server-Sent Events, and
 * clients -> server over plain POST. It also serves the app itself, so the QR
 * code the host prints can be scanned and land a phone straight on the board.
 *
 *   const host = require("./lan-host.js").createHost({ room: "chalk", static: "../docs/play" });
 *   const port = await host.listen(0);
 *   host.onMessage(m => console.log("got", m));
 *
 * PolyForm Noncommercial License 1.0.0. (c) 2026 Dr Sohil Momin.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon"
};

/* A short, unambiguous room code (no 0/O/1/I/L). */
function roomCode(n) {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < (n || 4); i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

function createHost(opts) {
  opts = opts || {};
  const room = opts.room || "default";
  const code = opts.code || roomCode(4);
  const clients = new Set();
  const handlers = [];
  const history = new Map();          // board -> [messages], for late joiners
  const HISTORY_MAX = opts.history === undefined ? 500 : opts.history;
  const root = opts.static ? path.resolve(opts.static) : null;

  function boardHistory(board) {
    if (!history.has(board)) history.set(board, []);
    return history.get(board);
  }

  function remember(msg) {
    if (!HISTORY_MAX) return;
    const board = (msg && msg.b) || "main";
    const list = boardHistory(board);
    list.push(msg);
    if (list.length > HISTORY_MAX) list.shift();
  }

  function broadcast(msg) {
    remember(msg);
    const payload = "event: message\ndata: " + JSON.stringify(msg) + "\n\n";
    for (const c of Array.from(clients)) {
      try { c.write(payload); } catch (e) { clients.delete(c); }
    }
    handlers.forEach(function (h) { try { h(msg); } catch (e) {} });
  }

  /* The board a late joiner gets: the host replays what it kept through the same
   * engine the clients use, and sends one snapshot instead of 500 messages. */
  function snapshotFor(board) {
    let Chalk = null;
    try { Chalk = require(path.join(__dirname, "..", "docs", "play", "chalk.js")); } catch (e) { return null; }
    const doc = Chalk.replay(boardHistory(board), null, board);
    return Chalk.toJSON(doc);
  }

  function serve(req, res, url) {
    if (!root) return false;
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.resolve(path.join(root, rel));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end("no"); return true; }
    fs.readFile(file, function (err, buf) {
      if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache"
      });
      res.end(buf);
    });
    return true;
  }

  const server = http.createServer(function (req, res) {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (url.pathname === "/events") {
      const board = url.searchParams.get("board") || "main";
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      });
      res.write("retry: 2000\n\n");
      res.write("event: hello\ndata: " + JSON.stringify({
        room: room, code: code, board: board, clients: clients.size + 1
      }) + "\n\n");

      /* One snapshot rather than the whole history, when the engine is here. */
      let sent = false;
      if (opts.snapshot !== false) {
        const snap = snapshotFor(board);
        if (snap) {
          res.write("event: snapshot\ndata: " + JSON.stringify({ t: "snapshot", b: board, doc: snap }) + "\n\n");
          sent = true;
        }
      }
      if (!sent && opts.replay) {
        boardHistory(board).forEach(function (m) {
          res.write("event: message\ndata: " + JSON.stringify(m) + "\n\n");
        });
      }

      clients.add(res);
      const ping = setInterval(function () { try { res.write(": ping\n\n"); } catch (e) {} }, 15000);
      req.on("close", function () { clearInterval(ping); clients.delete(res); });
      return;
    }

    if (url.pathname === "/send" && req.method === "POST") {
      let body = "";
      req.on("data", function (c) { body += c; if (body.length > 1e6) req.destroy(); });
      req.on("end", function () {
        let msg;
        try { msg = JSON.parse(body); } catch (e) { msg = null; }
        if (msg && typeof msg === "object") broadcast(msg);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, clients: clients.size }));
      });
      return;
    }

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true, app: "chalk", room: room, code: code,
        clients: clients.size, boards: Array.from(history.keys())
      }));
      return;
    }

    if (url.pathname === "/boards") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(Array.from(history.entries()).map(function (e) {
        return { board: e[0], messages: e[1].length };
      })));
      return;
    }

    if (serve(req, res, url)) return;

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  return {
    room: room,
    code: code,
    /* Resolves with the bound port, or rejects with the listen error (EADDRINUSE
     * being the one that happens in real rooms) so the caller can say something
     * useful instead of printing a stack trace at the person starting a lesson. */
    listen: function (port) {
      return new Promise(function (resolve, reject) {
        function onError(err) {
          server.removeListener("error", onError);
          reject(err);
        }
        server.once("error", onError);
        server.listen(port || 0, function () {
          server.removeListener("error", onError);
          server.on("error", function () { /* keep serving if a socket complains */ });
          resolve(server.address().port);
        });
      });
    },
    broadcast: broadcast,
    onMessage: function (h) { handlers.push(h); },
    clients: function () { return clients.size; },
    boards: function () { return Array.from(history.keys()); },
    close: function () {
      for (const c of Array.from(clients)) { try { c.end(); } catch (e) {} }
      return new Promise(function (resolve) { server.close(function () { resolve(); }); });
    }
  };
}

module.exports = { createHost: createHost, roomCode: roomCode };
