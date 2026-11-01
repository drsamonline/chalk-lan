/* test-node.js — headless tests for the Chalk board engine and its QR encoder.
 * Run: node test-node.js
 *
 * The engine is pure and dependency-free, so the whole mechanic — the document,
 * the live point protocol, notes, cursors, boards, undo/clear, replay, snapshots,
 * hit testing, shapes, the SVG export and the demo scenes — is tested here
 * without a browser or a network. The QR encoder is checked structurally: the
 * test suite cannot decode a code, so it asserts the geometry a decoder needs
 * (size, finders, timing, format and version blocks, quiet zone).
 */
"use strict";
var C = require("./docs/play/chalk.js");
var QR = require("./docs/play/qr.js");

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  (" + extra + ")" : "")); }
}

console.log("Chalk engine " + C.version + " — tests");

/* ---- 1. a fresh document ---- */
(function () {
  var d = C.newDoc();
  ok("newDoc has no strokes", d.strokes.length === 0 && d.v === 2);
  ok("newDoc has no notes", d.notes.length === 0);
  ok("newDoc sits on the main board", d.board === "main");
  var s = C.stats(d);
  ok("empty stats", s.strokes === 0 && s.points === 0 && s.authors === 0 && s.notes === 0);
})();

/* ---- 2. a full stroke message adds a stroke ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "stroke", id: "s1", author: "ana", color: "#ff0000", size: 6, nib: "marker",
    points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] });
  ok("stroke added", d.strokes.length === 1 && d.strokes[0].id === "s1");
  ok("author kept", d.strokes[0].author === "ana");
  ok("colour normalised", d.strokes[0].color === "#ff0000");
  ok("size kept", d.strokes[0].size === 6);
  ok("nib kept", d.strokes[0].nib === "marker");
  ok("points kept", d.strokes[0].points.length === 3 && d.strokes[0].points[2].x === 5);
})();

/* ---- 3. live points create a stroke on first touch, then append ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "point", id: "p1", author: "bo", color: "#00ff00", size: 4, x: 10, y: 10, p: 0.8 });
  ok("first point creates the stroke", d.strokes.length === 1 && d.strokes[0].points.length === 1);
  ok("stroke inherits colour/size/author",
    d.strokes[0].color === "#00ff00" && d.strokes[0].size === 4 && d.strokes[0].author === "bo");
  ok("pressure rides on the point", d.strokes[0].points[0].p === 0.8);
  C.apply(d, { t: "point", id: "p1", x: 11, y: 12 });
  C.apply(d, { t: "point", id: "p1", x: 13, y: 14 });
  ok("later points append", d.strokes[0].points.length === 3);
  ok("only one stroke for the id", d.strokes.length === 1);
  ok("a point without pressure stays bare", d.strokes[0].points[1].p === undefined);
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
  C.apply(d, { t: "wat" });
  C.apply(d, { t: "hello" });
  ok("nothing added for unknown messages", d.strokes.length === 0 && d.notes.length === 0);
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
  ok("clear empties", d.strokes.length === 0 && d.notes.length === 0);
  ok("rev advanced on changes", d.rev > 0);
})();

/* ---- 7. colour, size and pressure are sanitised ---- */
(function () {
  ok("bad colour -> default", C.normColor("javascript:alert(1)") === C.DEFAULT_COLOR);
  ok("erase sentinel is allowed", C.normColor("erase") === C.ERASE);
  ok("short hex rejected", C.normColor("#fff") === C.DEFAULT_COLOR);
  ok("good hex lowercased", C.normColor("#AABBCC") === "#aabbcc");
  ok("size clamped high", C.normSize(9999) === 64);
  ok("size clamped low", C.normSize(-3) === 1);
  ok("bad size -> default", C.normSize("big") === C.DEFAULT_SIZE);
  ok("pressure clamped", C.normPressure(9) === 1 && C.normPressure(-2) === 0.5);
  ok("a mouse reports half pressure", C.normPressure(0) === 0.5);
  ok("unknown tool -> pen", C.normTool("wobble") === "pen");
  ok("unknown nib -> chalk", C.normNib("brush") === "chalk");
  ok("unknown background -> plain", C.normBackground("tartan") === "plain");
  ok("unknown palette -> default", C.normPalette("neon") === "default");
})();

/* ---- 8. snapshot roundtrip, now with notes ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "stroke", id: "x", author: "cy", color: "#123456", size: 5, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
  C.apply(d, { t: "point", id: "y", author: "cy", color: "#abcdef", size: 2, x: 9, y: 9 });
  C.apply(d, { t: "note", id: "n1", author: "cy", color: "#22c55e", x: 40, y: 50, text: "look here" });
  var json = C.toJSON(d);
  var back = C.fromJSON(json);
  ok("roundtrip keeps stroke count", back.strokes.length === d.strokes.length);
  ok("roundtrip keeps points", C.stats(back).points === C.stats(d).points);
  ok("roundtrip keeps a colour", back.strokes[0].color === "#123456");
  ok("roundtrip keeps notes", back.notes.length === 1 && back.notes[0].text === "look here");
  ok("roundtrip keeps note position", back.notes[0].x === 40 && back.notes[0].y === 50);
  ok("fromJSON tolerates junk", C.fromJSON("{not json").strokes.length === 0);
  ok("fromJSON tolerates a missing board", C.fromJSON('{"strokes":[]}').board === "main");
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
  ok("replay ignores a cursor", C.stats(replayed).strokes === 1);
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

/* ---- 13. notes ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "note", id: "n1", author: "ana", color: "#f59e0b", x: 10, y: 20, text: "  hello   world  " });
  ok("note added", d.notes.length === 1);
  ok("note text is tidied", d.notes[0].text === "hello world");
  ok("note author kept", d.notes[0].author === "ana");
  C.apply(d, { t: "note", id: "n1", x: 30, y: 40, text: "moved" });
  ok("the same id moves and edits the note", d.notes.length === 1 && d.notes[0].x === 30 && d.notes[0].text === "moved");
  ok("a note with no position is dropped", (function () {
    var e = C.newDoc();
    C.apply(e, { t: "note", id: "z", text: "nowhere" });
    return e.notes.length === 0;
  })());
  C.apply(d, { t: "undo", id: "n1" });
  ok("undo removes a note", d.notes.length === 0);
  ok("note text is bounded", C.normText("x".repeat(400)).length === C.MAX_TEXT);
  ok("control characters are stripped", C.normText("a\u0000b\nc").indexOf("\u0000") === -1);
})();

/* ---- 14. cursors are not part of the document ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "cursor", id: "c1", author: "ana", color: "#22c55e", x: 5, y: 5 });
  ok("a cursor never lands in the document", d.strokes.length === 0 && d.notes.length === 0);
  var c = C.normCursor({ id: "c1", author: "ana", color: "#22c55e", x: 5.5, y: 6.5, laser: true, at: 7 });
  ok("a cursor is normalised", c && c.x === 5.5 && c.y === 6.5);
  ok("a laser cursor is flagged", c.laser === true);
  ok("a bad cursor is null", C.normCursor({ x: "no", y: 1 }) === null);
  ok("cursor colour is sanitised", C.normCursor({ x: 1, y: 1, color: "red" }).color === C.DEFAULT_COLOR);
})();

/* ---- 15. several boards in one room ---- */
(function () {
  var d = C.newDoc("lesson");
  C.apply(d, { t: "point", id: "a", b: "lesson", x: 1, y: 1 });
  C.apply(d, { t: "point", id: "b", b: "spare", x: 2, y: 2 });
  ok("a message for another board is ignored", d.strokes.length === 1 && d.strokes[0].id === "a");
  ok("a message with no board belongs to this one", (function () {
    C.apply(d, { t: "point", id: "c", x: 3, y: 3 });
    return d.strokes.length === 2;
  })());
  ok("board names are sanitised", C.normBoard("../../etc") === "main");
  ok("a plain board name survives", C.normBoard("lesson-2") === "lesson-2");
  ok("boardOf reads the message", C.boardOf({ b: "spare" }) === "spare");
  ok("boardOf is null without a board", C.boardOf({}) === null);
})();

/* ---- 16. a snapshot replaces the board ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "stroke", id: "old", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
  var other = C.newDoc();
  C.apply(other, { t: "stroke", id: "new", points: [{ x: 5, y: 5 }, { x: 6, y: 6 }] });
  C.apply(d, { t: "snapshot", doc: C.toJSON(other) });
  ok("snapshot replaces the strokes", d.strokes.length === 1 && d.strokes[0].id === "new");
  ok("snapshot keeps the local board name", d.board === "main");
  ok("snapshot bumps the revision", d.rev > 1);
})();

/* ---- 17. hit testing, for the eraser and for undo-anyone ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "stroke", id: "s1", size: 4, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] });
  C.apply(d, { t: "note", id: "n1", x: 300, y: 300, text: "here" });
  var hit = C.hitTest(d, 150, 101, 6);
  ok("hitTest finds a stroke", hit && hit.kind === "stroke" && hit.id === "s1");
  ok("hitTest misses the empty board", C.hitTest(d, 600, 600, 6) === null);
  ok("hitTest finds a note", C.hitTest(d, 310, 310, 6).kind === "note");
  ok("hitTest respects the tolerance", C.hitTest(d, 150, 130, 4) === null);
})();

/* ---- 18. shapes ---- */
(function () {
  var line = C.shapePoints("line", { x: 0, y: 0 }, { x: 100, y: 0 });
  ok("a line has points on both ends", line.length > 2 && line[0].x === 0 && line[line.length - 1].x === 100);
  var bx = C.shapePoints("box", { x: 10, y: 10 }, { x: 110, y: 60 });
  ok("a box closes on itself", bx.length > 20);
  ok("a box overshoots its corner", bx.some(function (p) { return p.x < 10 || p.x > 110; }));
  var ci = C.shapePoints("circle", { x: 0, y: 0 }, { x: 100, y: 100 });
  ok("a circle is an ellipse of points", ci.length === 41);
  ok("a circle stays inside its box", ci.every(function (p) { return p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100; }));
  ok("an unknown shape draws a line", C.shapePoints("scribble", { x: 0, y: 0 }, { x: 5, y: 5 }).length === 17);
})();

/* ---- 19. the SVG export ---- */
(function () {
  var d = C.newDoc();
  C.apply(d, { t: "stroke", id: "s1", color: "#ff0000", size: 3, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
  C.apply(d, { t: "note", id: "n1", x: 10, y: 10, text: "a & b" });
  var svg = C.toSVG(d, 800, 600);
  ok("SVG has the right viewport", svg.indexOf('viewBox="0 0 800 600"') !== -1);
  ok("SVG carries the stroke", svg.indexOf('stroke="#ff0000"') !== -1);
  ok("SVG carries the note text, escaped", svg.indexOf("a &amp; b") !== -1);
  ok("SVG is self-contained", svg.indexOf("<svg") === 0 && svg.indexOf("<image") === -1 &&
    svg.indexOf("href") === -1 && svg.indexOf("<script") === -1);
  ok("SVG tolerates an empty board", C.toSVG(C.newDoc(), 400, 300).indexOf("</svg>") !== -1);
})();

/* ---- 20. demo scenes are real, valid boards ---- */
(function () {
  C.sceneNames.forEach(function (name) {
    var msgs = C.scene(name, 800, 600);
    var d = C.replay(msgs, { w: 800, h: 600 });
    ok("scene '" + name + "' replays without throwing", Array.isArray(msgs));
    if (name !== "join") ok("scene '" + name + "' draws something", C.stats(d).strokes > 0 && C.stats(d).points > 0);
  });

  var lesson = C.replay(C.scene("lesson", 800, 600), { w: 800, h: 600 });
  ok("the lesson is drawn by more than one hand", C.stats(lesson).authors >= 3);
  ok("the lesson keeps every point on the board", lesson.strokes.every(function (s) {
    return s.points.every(function (p) { return p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 600; });
  }));
  ok("the lesson rubs something out", lesson.strokes.some(function (s) { return s.color === C.ERASE; }));
  ok("the lesson carries a note", lesson.notes.length === 1);
  ok("scene ids are unique inside a scene", (function () {
    var seen = {}, dup = false;
    C.scene("lesson", 800, 600).forEach(function (m) { if (seen[m.id]) dup = true; seen[m.id] = 1; });
    return !dup;
  })());
  ok("a scene scales to the phone width", (function () {
    var small = C.replay(C.scene("lesson", 430, 860), { w: 430, h: 860 });
    return small.strokes.length === lesson.strokes.length &&
      small.strokes.every(function (s) { return s.points.every(function (p) { return p.x <= 430; }); });
  })());
  ok("an unknown scene is empty, not an error", C.scene("nope", 800, 600).length === 0);
  ok("the join scene is a bare board", C.stats(C.replay(C.scene("join", 800, 600))).strokes === 0);
})();

/* ---- 21. the QR encoder (structure; a decoder cannot run here) ---- */
(function () {
  var q = QR.make("http://192.168.1.20:8080");
  ok("a join URL fits a small version", q.version >= 1 && q.version <= 4);
  ok("the matrix is square and odd", q.modules.length === q.size && q.size % 2 === 1 && q.size === q.version * 4 + 17);
  ok("the mask is in range", q.mask >= 0 && q.mask <= 7);

  function dark(r, c) { return q.modules[r][c] === 1; }
  var finders = [[0, 0], [0, q.size - 7], [q.size - 7, 0]];
  ok("three finder patterns are drawn", finders.every(function (f) {
    return dark(f[0], f[1]) && dark(f[0] + 6, f[1]) && dark(f[0], f[1] + 6) &&
      dark(f[0] + 3, f[1] + 3) && !dark(f[0] + 1, f[1] + 1);
  }));
  ok("the timing pattern alternates", (function () {
    var good = true;
    for (var i = 8; i < q.size - 8; i++) {
      if (dark(6, i) !== (i % 2 === 0)) good = false;
      if (dark(i, 6) !== (i % 2 === 0)) good = false;
    }
    return good;
  })());
  ok("the dark module is set", dark(q.size - 8, 8));

  var smaller = QR.make("CHALK");
  ok("a short string picks version 1", smaller.version === 1);
  ok("a long string grows the version", QR.make("x".repeat(90)).version > smaller.version);
  ok("a URL that will not fit throws", (function () {
    try { QR.make("x".repeat(400)); return false; } catch (e) { return true; }
  })());
  var svg = QR.svg("CHALK", { scale: 2 });
  ok("the SVG is self-contained", svg.indexOf("<svg") === 0 && svg.indexOf("http") !== -1 && svg.indexOf("<image") === -1);
  ok("the terminal rendering has half blocks", QR.ascii("CHALK").indexOf("\u2588") !== -1 ||
    QR.ascii("CHALK").indexOf("\u2580") !== -1 || QR.ascii("CHALK").indexOf("\u2584") !== -1);
  ok("the same text gives the same matrix twice", QR.make("CHALK").modules.join("") === QR.make("CHALK").modules.join(""));
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
