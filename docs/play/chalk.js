/* chalk.js — the engine of Chalk, the shared whiteboard.
 *
 * The whole point of Chalk is one thing: a shared, offline whiteboard for a room.
 * Everything common comes from the shared kits —
 *
 *   web-kit  — storage, i18n (EN/HI/GU), CSV, theme, a11y, ui
 *   lan-kit  — the LAN room transport (SSE server -> client, POST client -> server)
 *
 * — so this file keeps ONLY the board: the document, the message protocol that
 * keeps every device in the room in step, the geometry a board needs (hit
 * testing, shapes, SVG export) and the demo scenes the landing page draws.
 *
 * It is pure, zero-dependency, and runs unchanged in the browser (window.Chalk)
 * and under Node (module.exports), so the whole mechanic is unit-tested
 * headlessly.
 *
 * Part of the Forge system. PolyForm Noncommercial License 1.0.0.
 * (c) 2026 Dr Sohil Momin.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Chalk = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "0.4.0";

  var DEFAULT_COLOR = "#e7e9ee";
  var ERASE = "erase";
  var DEFAULT_SIZE = 3;
  var MAX_SIZE = 64;
  var MAX_POINTS_PER_STROKE = 20000;
  var MAX_STROKES = 5000;
  var MAX_NOTES = 500;
  var MAX_TEXT = 280;
  var MAX_BOARD = 24;
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var BOARD_NAME = /^[A-Za-z0-9_-]{1,24}$/;

  var TOOLS = ["pen", "line", "box", "circle", "note", "laser"];
  var NIBS = ["chalk", "marker", "pen"];
  var BACKGROUNDS = ["plain", "paper", "grid", "blackboard"];
  var PALETTES = ["default", "accessible", "contrast"];

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

  /* Pressure 0..1; a mouse reports 0.5, a pen reports the truth. */
  function normPressure(p) {
    p = Number(p);
    return isNum(p) && p > 0 ? Math.min(1, Math.max(0.05, p)) : 0.5;
  }

  /* A point, rounded to 0.1px to keep messages small, clamped to the board. */
  function normPoint(p, w, h) {
    if (!p || !isNum(p.x) || !isNum(p.y)) return null;
    var x = Math.round(p.x * 10) / 10, y = Math.round(p.y * 10) / 10;
    if (isNum(w) && w > 0) x = Math.min(w, Math.max(0, x));
    if (isNum(h) && h > 0) y = Math.min(h, Math.max(0, y));
    var out = { x: x, y: y };
    if (p.p !== undefined) out.p = normPressure(p.p);
    return out;
  }

  function normTool(t) { return TOOLS.indexOf(t) === -1 ? "pen" : t; }
  function normNib(n) { return NIBS.indexOf(n) === -1 ? "chalk" : n; }
  function normBackground(b) { return BACKGROUNDS.indexOf(b) === -1 ? "plain" : b; }
  function normPalette(p) { return PALETTES.indexOf(p) === -1 ? "default" : p; }

  /* Note text: one line, no control characters, bounded. */
  function normText(s) {
    return String(s == null ? "" : s)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TEXT);
  }

  function normBoard(b) {
    b = String(b || "");
    return BOARD_NAME.test(b) ? b : "main";
  }

  /* A short, collision-resistant stroke id. */
  function newId(rand) {
    rand = rand || Math.random;
    var A = "abcdefghijklmnopqrstuvwxyz0123456789", s = "";
    for (var i = 0; i < 10; i++) s += A[Math.floor(rand() * A.length)];
    return s;
  }

  function newDoc(board) { return { v: 2, rev: 0, board: normBoard(board), strokes: [], notes: [] }; }

  function newStroke(opts) {
    opts = opts || {};
    return {
      id: opts.id || newId(),
      author: String(opts.author || "guest").slice(0, 24),
      color: normColor(opts.color),
      size: normSize(opts.size),
      nib: normNib(opts.nib),
      tool: normTool(opts.tool),
      points: []
    };
  }

  function newNote(opts) {
    opts = opts || {};
    return {
      id: opts.id || newId(),
      author: String(opts.author || "guest").slice(0, 24),
      color: normColor(opts.color),
      x: isNum(opts.x) ? opts.x : 0,
      y: isNum(opts.y) ? opts.y : 0,
      text: normText(opts.text)
    };
  }

  function strokeById(doc, id) {
    if (!doc || !doc.strokes) return null;
    for (var i = 0; i < doc.strokes.length; i++) if (doc.strokes[i].id === id) return doc.strokes[i];
    return null;
  }

  function noteById(doc, id) {
    if (!doc || !doc.notes) return null;
    for (var i = 0; i < doc.notes.length; i++) if (doc.notes[i].id === id) return doc.notes[i];
    return null;
  }

  function addStroke(doc, stroke) {
    if (!doc || !stroke) return doc;
    if (doc.strokes.length >= MAX_STROKES) doc.strokes.shift();
    doc.strokes.push(stroke);
    doc.rev++;
    return doc;
  }

  function addNote(doc, note) {
    if (!doc || !note) return doc;
    var existing = noteById(doc, note.id);
    if (existing) {
      existing.text = note.text;
      existing.x = note.x;
      existing.y = note.y;
      existing.color = note.color;
    } else {
      if (doc.notes.length >= MAX_NOTES) doc.notes.shift();
      doc.notes.push(note);
    }
    doc.rev++;
    return doc;
  }

  /* Append a live point. The FIRST point of a stroke carries the stroke's
   * colour/size/author/nib, so a receiver can create it on the fly — this is what
   * makes the board feel live without a separate "begin" message. */
  function appendPoint(doc, msg, bounds) {
    var p = normPoint(msg, bounds && bounds.w, bounds && bounds.h);
    if (!p) return doc;
    var s = strokeById(doc, msg.id);
    if (!s) {
      s = newStroke({ id: msg.id, author: msg.author, color: msg.color, size: msg.size, nib: msg.nib, tool: msg.tool });
      addStroke(doc, s);
    }
    if (s.points.length < MAX_POINTS_PER_STROKE) { s.points.push(p); doc.rev++; }
    return doc;
  }

  function undo(doc, id) {
    if (!doc) return doc;
    var i;
    for (i = (doc.strokes || []).length - 1; i >= 0; i--) {
      if (doc.strokes[i].id === id) { doc.strokes.splice(i, 1); doc.rev++; return doc; }
    }
    for (i = (doc.notes || []).length - 1; i >= 0; i--) {
      if (doc.notes[i].id === id) { doc.notes.splice(i, 1); doc.rev++; return doc; }
    }
    return doc;
  }

  function clear(doc) {
    if (doc) { doc.strokes = []; doc.notes = []; doc.rev++; }
    return doc;
  }

  /* The board a message belongs to, so one room can carry several boards. */
  function boardOf(msg) { return msg && msg.b ? normBoard(msg.b) : null; }

  /* The one function the app calls for every inbound room message. Unknown or
   * malformed messages are ignored, never thrown — a whiteboard must not break
   * because someone sent garbage on the LAN. A message for another board is
   * ignored here and kept by the caller if it wants it. */
  function apply(doc, msg, bounds, opts) {
    if (!doc || !msg || typeof msg !== "object") return doc;
    var b = boardOf(msg);
    if (b && b !== doc.board) return doc;

    switch (msg.t) {
      case "stroke":
        addStroke(doc, {
          id: msg.id || newId(),
          author: msg.author,
          color: msg.color,
          size: msg.size,
          nib: msg.nib,
          tool: msg.tool,
          points: (Array.isArray(msg.points) ? msg.points : [])
            .map(function (p) { return normPoint(p, bounds && bounds.w, bounds && bounds.h); })
            .filter(Boolean)
        });
        break;
      case "point": appendPoint(doc, msg, bounds); break;
      case "note": {
        var np = normPoint({ x: msg.x, y: msg.y }, bounds && bounds.w, bounds && bounds.h);
        if (np) {
          addNote(doc, newNote({
            id: msg.id || newId(), author: msg.author, color: msg.color,
            x: np.x, y: np.y, text: msg.text
          }));
        }
        break;
      }
      case "undo": undo(doc, msg.id); break;
      case "clear": clear(doc); break;
      case "snapshot": {
        var snap = fromJSON(msg.doc);
        snap.board = doc.board;
        doc.strokes = snap.strokes;
        doc.notes = snap.notes;
        doc.rev = Math.max(doc.rev + 1, snap.rev);
        break;
      }
      /* "cursor" is a live pointer, not part of the document; "hello" and
       * anything else is not ours to draw. */
      default: break;
    }
    return doc;
  }

  /* A pointer from another hand: validated here, rendered by the app, never
   * stored in the document. */
  function normCursor(msg, bounds) {
    if (!msg || typeof msg !== "object") return null;
    var p = normPoint(msg, bounds && bounds.w, bounds && bounds.h);
    if (!p) return null;
    return {
      id: String(msg.id || "").slice(0, 24),
      author: String(msg.author || "guest").slice(0, 24),
      color: normColor(msg.color),
      laser: msg.laser === true,
      x: p.x, y: p.y,
      t: isNum(msg.at) ? msg.at : Date.now()
    };
  }

  /* Apply a whole sequence — used for a late joiner replaying the room history,
   * and for the host building a snapshot. */
  function replay(messages, bounds, board) {
    var doc = newDoc(board);
    (messages || []).forEach(function (m) { apply(doc, m, bounds); });
    return doc;
  }

  function stats(doc) {
    var strokes = (doc && doc.strokes) || [], notes = (doc && doc.notes) || [];
    var points = 0, authors = {}, inks = {};
    strokes.forEach(function (s) {
      points += s.points.length;
      authors[s.author] = (authors[s.author] || 0) + 1;
      inks[s.color] = (inks[s.color] || 0) + 1;
    });
    notes.forEach(function (n) { authors[n.author] = (authors[n.author] || 0) + 1; });
    return {
      strokes: strokes.length, notes: notes.length, points: points,
      authors: Object.keys(authors).length, inks: Object.keys(inks).length
    };
  }

  /* ---------- geometry ---------- */

  /* How far a point is from a line segment — the honest way to hit-test a stroke. */
  function segmentDistance(px, py, ax, ay, bx, by) {
    var vx = bx - ax, vy = by - ay;
    var len2 = vx * vx + vy * vy;
    var t = len2 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    var dx = ax + vx * t - px, dy = ay + vy * t - py;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* Which stroke or note is under the point, nearest first. Used by the eraser,
   * by "undo anyone" and by the shape tools' hit tests. */
  function hitTest(doc, x, y, tol) {
    if (!doc) return null;
    tol = isNum(tol) ? tol : 8;
    var best = null, bestD = Infinity, i, j;

    for (i = 0; i < (doc.notes || []).length; i++) {
      var n = doc.notes[i];
      if (x >= n.x - tol && x <= n.x + 150 && y >= n.y - tol && y <= n.y + 46) {
        var dn = Math.abs(x - n.x) + Math.abs(y - n.y);
        if (dn < bestD) { bestD = dn; best = { kind: "note", id: n.id, note: n }; }
      }
    }
    for (i = (doc.strokes || []).length - 1; i >= 0; i--) {
      var s = doc.strokes[i], pts = s.points, reach = tol + s.size / 2;
      for (j = 0; j < pts.length; j++) {
        /* distance to the vertex, and to the segment that ends at it, so a
         * straight stroke is hit anywhere along it and not only at its points */
        var d = Math.sqrt(Math.pow(pts[j].x - x, 2) + Math.pow(pts[j].y - y, 2));
        if (j > 0) {
          var sd = segmentDistance(x, y, pts[j - 1].x, pts[j - 1].y, pts[j].x, pts[j].y);
          if (sd < d) d = sd;
        }
        if (d <= reach && d < bestD) { bestD = d; best = { kind: "stroke", id: s.id, stroke: s }; }
      }
    }
    return best;
  }

  /* The points a shape tool commits: a straight line, a box or an ellipse,
   * between the press and the release. Hand-drawn shapes overshoot their corners
   * the way a person does. */
  function shapePoints(kind, a, b) {
    var pts = [], i, t, x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
    function line(ax, ay, bx, by, n) {
      for (var k = 0; k <= n; k++) {
        var u = k / n;
        pts.push({ x: ax + (bx - ax) * u, y: ay + (by - ay) * u });
      }
    }
    if (kind === "line") { line(x0, y0, x1, y1, 16); return pts; }
    if (kind === "box") {
      var ox = (x1 - x0) * 0.04, oy = (y1 - y0) * 0.06;
      line(x0 - ox, y0, x1 + ox, y0, 8);
      line(x1, y0 - oy, x1, y1 + oy, 8);
      line(x1 + ox, y1, x0 - ox, y1, 8);
      line(x0, y1 + oy, x0, y0 - oy, 8);
      return pts;
    }
    if (kind === "circle") {
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      var rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
      for (i = 0; i <= 40; i++) {
        t = (i / 40) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
      }
      return pts;
    }
    line(x0, y0, x1, y1, 16);
    return pts;
  }

  /* The stroke as a plain SVG polyline path. */
  function pathOf(stroke) {
    var pts = (stroke && stroke.points) || [];
    if (pts.length < 2) return "";
    return pts.map(function (p, i) { return (i ? "L" : "M") + p.x + " " + p.y; }).join(" ");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* A whole board as SVG — the vector export. Chalk strokes become paths, notes
   * become text, and the background comes from the same names the canvas uses. */
  function toSVG(doc, w, h, opts) {
    opts = opts || {};
    var W = isNum(w) && w > 0 ? w : 1200, H = isNum(h) && h > 0 ? h : 800;
    var bg = opts.background === "blackboard" ? "#0f2a23" : (opts.dark ? "#0f1115" : "#ffffff");
    var ink = opts.background === "blackboard" ? "#f2f0e2" : (opts.dark ? "#e7e9ee" : "#16241f");
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '">',
      '<rect width="' + W + '" height="' + H + '" fill="' + bg + '"/>'];

    ((doc && doc.strokes) || []).forEach(function (s) {
      var d = pathOf(s);
      var colour = s.color === ERASE ? bg : (s.color === DEFAULT_COLOR ? ink : s.color);
      if (!d) {
        var p = s.points[0];
        if (p) out.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (s.size / 2) + '" fill="' + colour + '"/>');
        return;
      }
      out.push('<path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="' + s.size +
        '" stroke-linecap="round" stroke-linejoin="round"' +
        (s.nib === "chalk" ? ' stroke-opacity="0.92"' : "") + "/>");
    });

    ((doc && doc.notes) || []).forEach(function (n) {
      var colour = n.color === DEFAULT_COLOR ? ink : n.color;
      out.push('<g><rect x="' + n.x + '" y="' + n.y + '" width="150" height="46" rx="6" fill="' +
        colour + '" fill-opacity="0.16" stroke="' + colour + '" stroke-opacity="0.5"/>');
      out.push('<text x="' + (n.x + 8) + '" y="' + (n.y + 20) + '" font-family="ui-sans-serif,sans-serif" ' +
        'font-size="13" fill="' + colour + '">' + esc(n.text.slice(0, 22)) + "</text>");
      if (n.text.length > 22) {
        out.push('<text x="' + (n.x + 8) + '" y="' + (n.y + 36) + '" font-family="ui-sans-serif,sans-serif" ' +
          'font-size="13" fill="' + colour + '">' + esc(n.text.slice(22, 44)) + "</text>");
      }
      out.push("</g>");
    });

    out.push("</svg>");
    return out.join("");
  }

  /* A validated, size-bounded snapshot for storage, a file, or a late joiner. */
  function toJSON(doc) {
    var out = { v: 2, rev: (doc && doc.rev) || 0, board: normBoard(doc && doc.board), strokes: [], notes: [] };
    var strokes = (doc && doc.strokes) || [];
    var notes = (doc && doc.notes) || [];
    for (var i = 0; i < strokes.length; i++) {
      var s = strokes[i];
      out.strokes.push({
        id: s.id, author: s.author, color: normColor(s.color), size: normSize(s.size),
        nib: normNib(s.nib), tool: normTool(s.tool),
        points: s.points.map(function (p) {
          var q = { x: p.x, y: p.y };
          if (p.p !== undefined) q.p = normPressure(p.p);
          return q;
        })
      });
    }
    for (var j = 0; j < notes.length; j++) {
      var n = notes[j];
      out.notes.push({ id: n.id, author: n.author, color: normColor(n.color), x: n.x, y: n.y, text: normText(n.text) });
    }
    return JSON.stringify(out);
  }

  function fromJSON(text) {
    var raw;
    try { raw = typeof text === "string" ? JSON.parse(text) : text; } catch (e) { return newDoc(); }
    if (!raw || (!Array.isArray(raw.strokes) && !Array.isArray(raw.notes))) return newDoc();
    var doc = newDoc(raw.board);
    (raw.strokes || []).forEach(function (s) {
      apply(doc, { t: "stroke", id: s.id, author: s.author, color: s.color, size: s.size, nib: s.nib, tool: s.tool, points: s.points });
    });
    (raw.notes || []).forEach(function (n) {
      apply(doc, { t: "note", id: n.id, author: n.author, color: n.color, x: n.x, y: n.y, text: n.text });
    });
    doc.rev = raw.rev || doc.rev;
    return doc;
  }

  /* ---------- demo scenes ----------
   * A scene is a plain list of protocol messages that draws a whole board, so
   * the landing page can show the real app drawing something instead of an
   * empty canvas, and a screenshot is worth looking at. Pure data — no DOM, no
   * network, no clock — so it is tested headlessly like the rest of the engine.
   *
   * Points are written as fractions of the board (0..1) and scaled on the way
   * out, so one scene works at 430px on a phone and 1280px on a laptop.
   */
  function scenePts(list, w, h) {
    var W = isNum(w) && w > 0 ? w : 1000, H = isNum(h) && h > 0 ? h : 700;
    return list.map(function (s) {
      return {
        t: s.t === "note" ? "note" : "stroke",
        id: newId(), author: s.author, color: normColor(s.color),
        size: normSize(s.size), nib: normNib(s.nib), tool: normTool(s.tool),
        x: s.x === undefined ? 0 : Math.round(s.x * W * 10) / 10,
        y: s.y === undefined ? 0 : Math.round(s.y * H * 10) / 10,
        text: s.text,
        points: (s.pts || []).map(function (p) {
          return { x: Math.round(p[0] * W * 10) / 10, y: Math.round(p[1] * H * 10) / 10 };
        })
      };
    });
  }

  function line(x0, y0, x1, y1, n) {
    n = n || 10;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
    return out;
  }

  function box(x0, y0, x1, y1) {
    var ox = (x1 - x0) * 0.05, oy = (y1 - y0) * 0.07;
    return line(x0 - ox, y0, x1 + ox, y0, 8)
      .concat(line(x1, y0 - oy, x1, y1 + oy, 8))
      .concat(line(x1 + ox, y1, x0 - ox, y1, 8))
      .concat(line(x0, y1 + oy, x0, y0 - oy, 8));
  }

  function arc(cx, cy, rx, ry, a0, a1, n) {
    n = n || 24;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var a = a0 + (a1 - a0) * (i / n);
      out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return out;
  }

  function arrow(x0, y0, x1, y1) {
    var head = 0.022, ang = Math.atan2(y1 - y0, x1 - x0);
    var l = [x1 - Math.cos(ang - 0.5) * head, y1 - Math.sin(ang - 0.5) * head];
    var r = [x1 - Math.cos(ang + 0.5) * head, y1 - Math.sin(ang + 0.5) * head];
    return line(x0, y0, x1, y1, 10).concat([l, [x1, y1], r]);
  }

  function tick(x, y) {
    return line(x - 0.025, y + 0.02, x, y + 0.05, 4).concat(line(x, y + 0.05, x + 0.055, y - 0.05, 6));
  }

  var SCENES = {
    /* A worked problem, three people annotating the same board. */
    lesson: function (w, h) {
      var A = "#628ff1", B = "#22c55e", C = "#f59e0b", K = DEFAULT_COLOR;
      return scenePts([
        { author: "ana", color: K, size: 4, pts: line(0.09, 0.24, 0.46, 0.24, 12) },
        { author: "ana", color: A, size: 4, pts: box(0.06, 0.30, 0.50, 0.46) },
        { author: "ana", color: A, size: 3, pts: arrow(0.52, 0.38, 0.62, 0.38) },
        { author: "bo", color: B, size: 3, pts: line(0.62, 0.42, 0.88, 0.42, 10) },
        { author: "bo", color: B, size: 3, pts: tick(0.64, 0.52) },
        { author: "cy", color: C, size: 4, pts: arc(0.74, 0.66, 0.075, 0.085, 0, 6.283, 28) },
        { author: "cy", color: C, size: 3, pts: arrow(0.74, 0.57, 0.74, 0.50) },
        { author: "ana", color: K, size: 3, pts: line(0.10, 0.68, 0.44, 0.68, 10) },
        { author: "ana", color: "erase", size: 26, pts: line(0.12, 0.80, 0.40, 0.805, 8) },
        { author: "bo", color: B, size: 3, pts: line(0.12, 0.80, 0.46, 0.80, 10) },
        { t: "note", author: "cy", color: C, x: 0.58, y: 0.72, text: "check this with the class" }
      ], w, h);
    },

    /* The eraser: a line rubbed out and redrawn, a circle round what is left. */
    erase: function (w, h) {
      var K = DEFAULT_COLOR, A = "#628ff1", B = "#22c55e", S = "#38bdf8";
      return scenePts([
        { author: "ana", color: K, size: 5, pts: line(0.10, 0.28, 0.54, 0.28, 14) },
        { author: "ana", color: "erase", size: 30, pts: line(0.20, 0.285, 0.42, 0.28, 10) },
        { author: "ana", color: K, size: 5, pts: line(0.10, 0.28, 0.34, 0.28, 8) },
        { author: "bo", color: A, size: 3, pts: arrow(0.56, 0.28, 0.66, 0.28) },
        { author: "bo", color: B, size: 3, pts: tick(0.68, 0.28) },
        { author: "cy", color: S, size: 6, pts: arc(0.30, 0.62, 0.11, 0.15, 0, 6.283, 30) }
      ], w, h);
    },

    /* A board nobody has touched yet — what a new joiner sees. */
    join: function () { return []; }
  };

  function scene(name, w, h) {
    var fn = SCENES[name];
    return fn ? fn(w, h) : [];
  }

  return {
    version: VERSION,
    DEFAULT_COLOR: DEFAULT_COLOR,
    ERASE: ERASE,
    DEFAULT_SIZE: DEFAULT_SIZE,
    MAX_TEXT: MAX_TEXT,
    TOOLS: TOOLS,
    NIBS: NIBS,
    BACKGROUNDS: BACKGROUNDS,
    PALETTES: PALETTES,
    scenes: SCENES,
    scene: scene,
    sceneNames: ["lesson", "erase", "join"],
    newId: newId,
    newDoc: newDoc,
    newStroke: newStroke,
    newNote: newNote,
    strokeById: strokeById,
    noteById: noteById,
    addStroke: addStroke,
    addNote: addNote,
    appendPoint: appendPoint,
    undo: undo,
    clear: clear,
    apply: apply,
    replay: replay,
    stats: stats,
    hitTest: hitTest,
    segmentDistance: segmentDistance,
    shapePoints: shapePoints,
    toSVG: toSVG,
    toJSON: toJSON,
    fromJSON: fromJSON,
    pathOf: pathOf,
    boardOf: boardOf,
    normCursor: normCursor,
    normColor: normColor,
    normSize: normSize,
    normPoint: normPoint,
    normPressure: normPressure,
    normText: normText,
    normBoard: normBoard,
    normTool: normTool,
    normNib: normNib,
    normBackground: normBackground,
    normPalette: normPalette
  };
});
