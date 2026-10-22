/* chalk.js — the app-specific layer of Chalk, the shared whiteboard.
 *
 * The whole point of Chalk is one thing: a shared, offline whiteboard for a room.
 * Everything common comes from the shared kits —
 *
 *   web-kit  — storage, i18n (EN/HI/GU), CSV, theme, a11y, ui
 *   lan-kit  — the LAN room transport (SSE server -> client, POST client -> server)
 *
 * — so this file keeps ONLY the one unique mechanic: the board document and the
 * tiny message protocol that keeps every device in the room in step. It is pure,
 * zero-dependency, and runs unchanged in the browser (window.Chalk) and under
 * Node (module.exports), so it is unit-tested headlessly.
 *
 * Part of the Forge system. MIT License. (c) 2026 Dr Sohil Momin.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Chalk = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "0.1.0";

  var DEFAULT_COLOR = "#e7e9ee";
  var ERASE = "erase";
  var DEFAULT_SIZE = 3;
  var MAX_SIZE = 64;
  var MAX_POINTS_PER_STROKE = 20000;
  var MAX_STROKES = 5000;
  var HEX = /^#[0-9a-fA-F]{6}$/;

  function isNum(n) { return typeof n === "number" && isFinite(n); }

  /* A safe colour: a #rrggbb hex, the sentinel "erase" (the board background),
   * or the default ink. Anything else is discarded, so a hostile or buggy peer
   * cannot inject a value the renderer would treat as a style. */
  function normColor(c) {
    c = String(c || "");
    if (c === ERASE) return ERASE;
    return HEX.test(c) ? c.toLowerCase() : DEFAULT_COLOR;
  }

  /* A safe brush size: a finite number clamped to 1..MAX_SIZE. */
  function normSize(s) { s = Number(s); return isNum(s) ? Math.min(MAX_SIZE, Math.max(1, s)) : DEFAULT_SIZE; }

  /* A point, rounded to 0.1px to keep messages small, clamped to the board. */
  function normPoint(p, w, h) {
    if (!p || !isNum(p.x) || !isNum(p.y)) return null;
    var x = Math.round(p.x * 10) / 10, y = Math.round(p.y * 10) / 10;
    if (isNum(w) && w > 0) x = Math.min(w, Math.max(0, x));
    if (isNum(h) && h > 0) y = Math.min(h, Math.max(0, y));
    return { x: x, y: y };
  }

  /* A short, collision-resistant stroke id. */
  function newId(rand) {
    rand = rand || Math.random;
    var A = "abcdefghijklmnopqrstuvwxyz0123456789", s = "";
    for (var i = 0; i < 10; i++) s += A[Math.floor(rand() * A.length)];
    return s;
  }

  function newDoc() { return { v: 1, rev: 0, strokes: [] }; }

  function newStroke(opts) {
    opts = opts || {};
    return {
      id: opts.id || newId(),
      author: String(opts.author || "guest").slice(0, 24),
      color: normColor(opts.color),
      size: normSize(opts.size),
      points: []
    };
  }

  function strokeById(doc, id) {
    if (!doc || !doc.strokes) return null;
    for (var i = 0; i < doc.strokes.length; i++) if (doc.strokes[i].id === id) return doc.strokes[i];
    return null;
  }

  function addStroke(doc, stroke) {
    if (!doc || !stroke) return doc;
    if (doc.strokes.length >= MAX_STROKES) doc.strokes.shift();
    doc.strokes.push(stroke);
    doc.rev++;
    return doc;
  }

  /* Append a live point. The FIRST point of a stroke carries the stroke's
   * colour/size/author, so a receiver can create it on the fly — this is what
   * makes the board feel live without a separate "begin" message. */
  function appendPoint(doc, msg, bounds) {
    var p = normPoint(msg, bounds && bounds.w, bounds && bounds.h);
    if (!p) return doc;
    var s = strokeById(doc, msg.id);
    if (!s) {
      s = newStroke({ id: msg.id, author: msg.author, color: msg.color, size: msg.size });
      addStroke(doc, s);
    }
    if (s.points.length < MAX_POINTS_PER_STROKE) { s.points.push(p); doc.rev++; }
    return doc;
  }

  function undo(doc, id) {
    if (!doc || !doc.strokes) return doc;
    for (var i = doc.strokes.length - 1; i >= 0; i--) {
      if (doc.strokes[i].id === id) { doc.strokes.splice(i, 1); doc.rev++; break; }
    }
    return doc;
  }

  function clear(doc) { if (doc) { doc.strokes = []; doc.rev++; } return doc; }

  /* The one function the app calls for every inbound room message. Unknown or
   * malformed messages are ignored, never thrown — a whiteboard must not break
   * because someone sent garbage on the LAN. */
  function apply(doc, msg, bounds) {
    if (!doc || !msg || typeof msg !== "object") return doc;
    switch (msg.t) {
      case "stroke":
        addStroke(doc, {
          id: msg.id || newId(),
          author: msg.author,
          color: msg.color,
          size: msg.size,
          points: (Array.isArray(msg.points) ? msg.points : [])
            .map(function (p) { return normPoint(p, bounds && bounds.w, bounds && bounds.h); })
            .filter(Boolean)
        });
        break;
      case "point": appendPoint(doc, msg, bounds); break;
      case "undo": undo(doc, msg.id); break;
      case "clear": clear(doc); break;
      /* "cursor"/"hello"/anything else: not part of the document. */
      default: break;
    }
    return doc;
  }

  /* Apply a whole sequence — used for a late joiner replaying the room history. */
  function replay(messages, bounds) {
    var doc = newDoc();
    (messages || []).forEach(function (m) { apply(doc, m, bounds); });
    return doc;
  }

  function stats(doc) {
    var strokes = (doc && doc.strokes) || [], points = 0, authors = {};
    strokes.forEach(function (s) {
      points += s.points.length;
      authors[s.author] = (authors[s.author] || 0) + 1;
    });
    return { strokes: strokes.length, points: points, authors: Object.keys(authors).length };
  }

  /* A validated, size-bounded snapshot for storage / a static export. */
  function toJSON(doc) {
    var out = { v: 1, rev: (doc && doc.rev) || 0, strokes: [] };
    var strokes = (doc && doc.strokes) || [];
    for (var i = 0; i < strokes.length; i++) {
      var s = strokes[i];
      out.strokes.push({
        id: s.id, author: s.author, color: normColor(s.color), size: normSize(s.size),
        points: s.points.map(function (p) { return { x: p.x, y: p.y }; })
      });
    }
    return JSON.stringify(out);
  }

  function fromJSON(text) {
    var raw;
    try { raw = typeof text === "string" ? JSON.parse(text) : text; } catch (e) { return newDoc(); }
    if (!raw || !Array.isArray(raw.strokes)) return newDoc();
    var doc = newDoc();
    raw.strokes.forEach(function (s) { apply(doc, { t: "stroke", id: s.id, author: s.author, color: s.color, size: s.size, points: s.points }); });
    doc.rev = raw.rev || doc.rev;
    return doc;
  }

  /* The stroke as a plain SVG polyline path — handy for a PNG/CSV-free export
   * or for tests. Returns "" for a stroke with fewer than two points. */
  function pathOf(stroke) {
    var pts = (stroke && stroke.points) || [];
    if (pts.length < 2) return "";
    return pts.map(function (p, i) { return (i ? "L" : "M") + p.x + " " + p.y; }).join(" ");
  }

  return {
    version: VERSION,
    DEFAULT_COLOR: DEFAULT_COLOR,
    ERASE: ERASE,
    DEFAULT_SIZE: DEFAULT_SIZE,
    newId: newId,
    newDoc: newDoc,
    newStroke: newStroke,
    strokeById: strokeById,
    addStroke: addStroke,
    appendPoint: appendPoint,
    undo: undo,
    clear: clear,
    apply: apply,
    replay: replay,
    stats: stats,
    toJSON: toJSON,
    fromJSON: fromJSON,
    pathOf: pathOf,
    normColor: normColor,
    normSize: normSize,
    normPoint: normPoint
  };
});
