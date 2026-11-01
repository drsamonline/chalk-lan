/* lan-kit.js — the browser client for a drsamonline LAN room. Zero dependencies.
 *
 * Talks to a lan-host over Server-Sent Events (server -> client) and POST
 * (client -> server). Works on a LAN with no internet and no accounts.
 *
 *   const c = Lan.client({ url: Lan.hostUrl(8080), board: "main",
 *                          onOpen:     h => console.log("joined", h.room),
 *                          onSnapshot: s => console.log("caught up", s.doc),
 *                          onMessage:  m => console.log("got", m) });
 *   c.send({ from: "me", text: "hello room" });
 *
 *   Lan.health("http://192.168.1.20:8080").then(h => console.log(h.room, h.code));
 *   Lan.scan().then(list => console.log(list));   // find a room on this Wi-Fi
 *
 * PolyForm Noncommercial License 1.0.0. (c) 2026 Dr Sohil Momin.
 */
(function (root) {
  "use strict";
  var Lan = { version: "0.2.0" };

  function base(url) { return String(url || "").replace(/\/+$/, ""); }
  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return s; } }

  Lan.client = function (opts) {
    opts = opts || {};
    var url = base(opts.url || "");
    var board = opts.board || "main";
    var es = new EventSource(url + "/events?board=" + encodeURIComponent(board));

    es.addEventListener("hello", function (e) { if (opts.onOpen) opts.onOpen(safeParse(e.data)); });
    es.addEventListener("snapshot", function (e) { if (opts.onSnapshot) opts.onSnapshot(safeParse(e.data)); });
    es.addEventListener("message", function (e) { if (opts.onMessage) opts.onMessage(safeParse(e.data)); });
    es.onerror = function (e) { if (opts.onError) opts.onError(e); };

    return {
      url: url,
      board: board,
      send: function (msg) {
        var body = JSON.stringify(msg);
        return fetch(url + "/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body
        }).then(function (r) { return r.json(); });
      },
      close: function () { try { es.close(); } catch (e) {} }
    };
  };

  /* A short, unambiguous room code (no 0/O/1/I/L). */
  Lan.roomCode = function (n) {
    n = n || 4;
    var A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", s = "";
    for (var i = 0; i < n; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  };

  /* The host URL for this device on the current LAN. */
  Lan.hostUrl = function (port) {
    var host = location.hostname || "localhost";   /* file:// has no hostname */
    return "http://" + host + ":" + (port || 8080);
  };

  /* Ask a host who it is. Resolves to null on anything but a healthy Chalk host. */
  Lan.health = function (url, timeoutMs) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 1200);
    return fetch(base(url) + "/health", ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        clearTimeout(timer);
        return j && j.ok && j.app === "chalk" ? j : null;
      })
      .catch(function () { clearTimeout(timer); return null; });
  };

  /* Look for a Chalk host on this device's own subnet — no internet, no DNS,
   * nothing outside the room's Wi-Fi. Tries the /24 around the current address,
   * a handful at a time, and reports every host that answers. */
  Lan.scan = function (opts) {
    opts = opts || {};
    var port = opts.port || 8080;
    var host = location.hostname;
    var m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    if (!m) return Promise.resolve([]);
    var prefix = m[1] + "." + m[2] + "." + m[3] + ".";
    var from = opts.from || 1, to = opts.to || 254;
    var batch = opts.batch || 24;
    var found = [];
    var queue = [];
    for (var i = from; i <= to; i++) {
      if (String(i) === m[4]) continue;             /* that is us */
      queue.push(prefix + i);
    }

    function worker() {
      if (!queue.length) return Promise.resolve();
      var addr = queue.shift();
      return Lan.health("http://" + addr + ":" + port, opts.timeout || 700)
        .then(function (h) {
          if (h) {
            found.push({ url: "http://" + addr + ":" + port, room: h.room, code: h.code, clients: h.clients });
            if (opts.onFound) opts.onFound(found[found.length - 1]);
          }
        })
        .then(worker);
    }

    var workers = [];
    for (var w = 0; w < batch; w++) workers.push(worker());
    return Promise.all(workers).then(function () { return found; });
  };

  root.Lan = Lan;
})(typeof globalThis !== "undefined" ? globalThis : this);
