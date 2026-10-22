/* test-node.js — headless tests for the Chalk board engine.
 * Run: node test-node.js
 *
 * The engine is pure and dependency-free, so the whole mechanic — the document,
 * the live point protocol, undo/clear, replay and the snapshot roundtrip — is
 * tested here without a browser or a network.
 */
"use strict";
var C = require("./docs/play/chalk.js");

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  (" + extra + ")" : "")); }
}

console.log("Chalk engine " + C.version + " — tests");

/* ---- 1. a fresh document ---- */
(function () {
  var d = C.newDoc();
  ok("newDoc has no strokes", d.strokes.length === 0 && d.v === 1);
  var s = C.stats(d);
  ok("empty stats", s.strokes === 0 && s.points === 0 && s.authors === 0);
})();

/* ---- 2. a full stroke message adds a stroke ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "stroke", id: "s1", author: "ana", color: "#ff0000", size: 6,
    points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] });
  ok("stroke added", d.strokes.length === 1 && d.strokes[0].id === "s1");
  ok("author kept", d.strokes[0].author === "ana");
  ok("colour normalised", d.strokes[0].color === "#ff0000");
  ok("size kept", d.strokes[0].size === 6);
  ok("points kept", d.strokes[0].points.length === 3 && d.strokes[0].points[2].x === 5);
})();

/* ---- 3. live points create a stroke on first touch, then append ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "point", id: "p1", author: "bo", color: "#00ff00", size: 4, x: 10, y: 10 });
  ok("first point creates the stroke", d.strokes.length === 1 && d.strokes[0].points.length === 1);
  ok("stroke inherits colour/size/author",
    d.strokes[0].color === "#00ff00" && d.strokes[0].size === 4 && d.strokes[0].author === "bo");
  C.apply(d, { t: "point", id: "p1", x: 11, y: 12 });
  C.apply(d, { t: "point", id: "p1", x: 13, y: 14 });
  ok("later points append", d.strokes[0].points.length === 3);
  ok("only one stroke for the id", d.strokes.length === 1);
})();

/* ---- 4. malformed points are dropped, not thrown ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "point", id: "bad", x: "nope", y: 5 });
  ok("NaN point ignored", d.strokes.length === 0);
  C.apply(d, { t: "point", id: "ok", x: 5, y: 5 });
  C.apply(d, { t: "point", id: "ok", x: null, y: 5 });
  ok("null point ignored", d.strokes[0].points.length === 1);
})();

/* ---- 5. unknown and malformed messages are ignored ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, null);
  C.apply(d, "hello");
  C.apply(d, { t: "cursor", x: 1, y: 1 });
  C.apply(d, { t: "wat" });
  ok("nothing added for unknown messages", d.strokes.length === 0);
  ok("no throw on garbage", true);
})();

/* ---- 6. undo removes the right stroke, clear empties the board ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "stroke", id: "a", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  C.apply(d, { t: "stroke", id: "b", points: [{ x: 2, y: 2 }, { x: 3, y: 3 }] });
  C.apply(d, { t: "undo", id: "a" });
  ok("undo removed 'a'", d.strokes.length === 1 && d.strokes[0].id === "b");
  C.apply(d, { t: "clear" });
  ok("clear empties", d.strokes.length === 0);
  ok("rev advanced on changes", d.rev > 0);
})();

/* ---- 7. colour and size are sanitised ---- */
(function () {
  ok("bad colour -> default", C.normColor("javascript:alert(1)") === C.DEFAULT_COLOR);
  ok("erase sentinel is allowed", C.normColor("erase") === C.ERASE);
  ok("short hex rejected", C.normColor("#fff") === C.DEFAULT_COLOR);
  ok("good hex lowercased", C.normColor("#AABBCC") === "#aabbcc");
  ok("size clamped high", C.normSize(9999) === 64);
  ok("size clamped low", C.normSize(-3) === 1);
  ok("bad size -> default", C.normSize("big") === C.DEFAULT_SIZE);
})();

/* ---- 8. snapshot roundtrip ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "stroke", id: "x", author: "cy", color: "#123456", size: 5, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
  C.apply(d, { t: "point", id: "y", author: "cy", color: "#abcdef", size: 2, x: 9, y: 9 });
  var json = C.toJSON(d);
  var back = C.fromJSON(json);
  ok("roundtrip keeps stroke count", back.strokes.length === d.strokes.length);
  ok("roundtrip keeps points", C.stats(back).points === C.stats(d).points);
  ok("roundtrip keeps a colour", back.strokes[0].color === "#123456");
  ok("fromJSON tolerates junk", C.fromJSON("{not json").strokes.length === 0);
})();

/* ---- 9. replay rebuilds the same board from history ---- */
(function () {
  var history = [
    { t: "stroke", id: "s1", author: "ana", color: "#ff0000", size: 3, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    { t: "point", id: "s2", author: "bo", color: "#00ff00", size: 3, x: 5, y: 5 },
    { t: "point", id: "s2", x: 6, y: 6 },
    { t: "undo", id: "s1" },
    { t: "cursor", x: 1, y: 1 }
  ];
  var live = C.newDoc();
  history.forEach(function (m) { C.apply(live, m); });
  var replayed = C.replay(history);
  ok("replay matches live apply", C.toJSON(replayed) === C.toJSON(live));
  ok("replay dropped the undone stroke", C.strokeById(replayed, "s1") === null);
  ok("replay kept the drawn stroke", C.strokeById(replayed, "s2").points.length === 2);
  ok("replay leaves exactly the surviving stroke", C.stats(replayed).strokes === 1);
})();

/* ---- 10. bounds clamp points to the board ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "point", id: "c", x: 9999, y: -5 }, { w: 800, h: 600 });
  ok("point clamped to the board", d.strokes[0].points[0].x === 800 && d.strokes[0].points[0].y === 0);
})();

/* ---- 11. ids are unique-ish and well formed ---- */
(function () {
  var a = C.newId(), b = C.newId();
  ok("ids are 10 chars", a.length === 10 && b.length === 10);
  ok("ids differ", a !== b);
})();

/* ---- 12. path export ---- */
(function () {
  var s = C.newStroke({ color: "#ffffff", size: 2 });
  s.points = [{ x: 0, y: 0 }, { x: 4, y: 5 }];
  ok("pathOf builds an SVG path", C.pathOf(s) === "M0 0 L4 5");
  ok("pathOf needs two points", C.pathOf({ points: [{ x: 0, y: 0 }] }) === "");
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
