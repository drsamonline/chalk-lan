/* test-host.js — the room host, tested against itself. Run: node test-host.js
 *
 * Starts a real host on a free port, then speaks to it over HTTP exactly as a
 * browser would: /health, the SSE stream with its snapshot, a POSTed stroke, and
 * the static board the host serves. No mocks, no network beyond 127.0.0.1.
 */
"use strict";
const path = require("path");
const http = require("http");
const { createHost } = require("./host/lan-host.js");
const Chalk = require("./docs/play/chalk.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  (" + extra + ")" : "")); }
}

/* Minimal HTTP helpers — node's built-in fetch needs WebAssembly, which some
 * sandboxes refuse to allocate, and this test should run anywhere node does. */
function get(port, path) {
  return new Promise(function (resolve, reject) {
    http.get({ host: "127.0.0.1", port: port, path: path }, function (res) {
      let body = "";
      res.on("data", function (c) { body += c; });
      res.on("end", function () { resolve({ status: res.statusCode, headers: res.headers, body: body }); });
    }).on("error", reject);
  });
}

function post(port, path, obj) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify(obj);
    const req = http.request({ host: "127.0.0.1", port: port, path: path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      function (res) {
        let out = "";
        res.on("data", function (c) { out += c; });
        res.on("end", function () { resolve({ status: res.statusCode, body: out }); });
      });
    req.on("error", reject);
    req.end(body);
  });
}

/* Read an SSE stream until `want` is satisfied, then close it. */
function readEvents(port, path, want, timeoutMs) {
  return new Promise(function (resolve) {
    const seen = [];
    let buffer = "";
    const req = http.get({ host: "127.0.0.1", port: port, path: path }, function (res) {
      res.setEncoding("utf8");
      res.on("data", function (chunk) {
        buffer += chunk;
        let at;
        while ((at = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const ev = { event: "message", data: null };
          block.split("\n").forEach(function (line) {
            if (line.startsWith("event: ")) ev.event = line.slice(7);
            else if (line.startsWith("data: ")) ev.data = line.slice(6);
          });
          if (ev.data) { try { ev.json = JSON.parse(ev.data); } catch (e) {} }
          seen.push(ev);
        }
        if (want(seen)) { req.destroy(); resolve(seen); }
      });
    });
    req.on("error", function () { resolve(seen); });
    setTimeout(function () { try { req.destroy(); } catch (e) {} resolve(seen); }, timeoutMs || 4000);
  });
}

(async function () {
  console.log("Chalk host — integration tests");
  const host = createHost({
    room: "chalk", code: "K7QP", history: 20, snapshot: true,
    static: path.join(__dirname, "docs", "play")
  });
  const port = await host.listen(0);
  const base = "http://127.0.0.1:" + port;

  const health = JSON.parse((await get(port, "/health")).body);
  ok("health answers", health.ok === true);
  ok("health carries the room and the code", health.room === "chalk" && health.code === "K7QP");
  ok("health counts the clients", health.clients === 0);

  /* a stroke goes in through the front door */
  await post(port, "/send", { t: "stroke", id: "s1", author: "ana", b: "main",
    color: "#22c55e", size: 4, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] });
  ok("a POSTed message is accepted", true);

  /* a joiner gets a snapshot, not the history */
  const events = await readEvents(port, "/events?board=main", function (seen) {
    return seen.some(function (e) { return e.event === "hello"; }) &&
      seen.some(function (e) { return e.event === "snapshot"; });
  });
  const hello = events.find(function (e) { return e.event === "hello"; });
  const snap = events.find(function (e) { return e.event === "snapshot"; });
  ok("the stream says hello", hello && hello.json.room === "chalk" && hello.json.code === "K7QP");
  ok("the stream sends a snapshot", snap && typeof snap.json.doc === "string");
  const doc = Chalk.fromJSON(snap.json.doc);
  ok("the snapshot holds what was sent", Chalk.stats(doc).strokes === 1 && doc.strokes[0].author === "ana");

  /* a second board is kept apart */
  const other = await readEvents(port, "/events?board=spare", function (seen) {
    return seen.some(function (e) { return e.event === "snapshot"; });
  });
  const spare = other.find(function (e) { return e.event === "snapshot"; });
  ok("another board starts empty", Chalk.stats(Chalk.fromJSON(spare.json.doc)).strokes === 0);

  /* the host serves the board itself, so the QR lands on it */
  const page = await get(port, "/");
  ok("the host serves the app", page.status === 200 && page.body.indexOf("<canvas") !== -1);
  ok("the app is served as HTML", (page.headers["content-type"] || "").indexOf("text/html") === 0);
  const missing = await get(port, "/nope.html");
  ok("an unknown file is a 404", missing.status === 404);

  /* a live message reaches an open client */
  const live = readEvents(port, "/events?board=main", function (seen) {
    return seen.some(function (e) { return e.json && e.json.id === "live1"; });
  });
  setTimeout(function () {
    post(port, "/send", { t: "point", id: "live1", b: "main", x: 5, y: 5 }).catch(function () {});
  }, 150);
  const got = await live;
  ok("a POSTed point reaches an open stream", got.some(function (e) { return e.json && e.json.id === "live1"; }));

  await host.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
