/* qr.js — a small QR encoder, so a room can be joined by pointing a phone at a
 * terminal. Zero dependencies, no network: the matrix is computed here.
 *
 * Scope is deliberately narrow — byte mode, error correction L, versions 1-10 —
 * which is everything a join URL needs. It runs unchanged in the browser
 * (window.QR) and under Node (module.exports), and it is checked against a
 * reference encoder in the test suite.
 *
 *   QR.make("http://192.168.1.20:8080")      -> { size, modules, version, mask }
 *   QR.svg(text, {scale: 4, quiet: 2})       -> "<svg …>"
 *   QR.ascii(text)                           -> a string for a terminal
 *
 * Part of the Forge system. PolyForm Noncommercial License 1.0.0.
 * (c) 2026 Dr Sohil Momin.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.QR = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---- per-version geometry and capacity, error correction L only ---- */
  /* [totalCodewords, eccPerBlock, blocksGroup1, dataPerBlock1, blocksGroup2, dataPerBlock2] */
  var VERSIONS = {
    1: [26, 7, 1, 19, 0, 0],
    2: [44, 10, 1, 34, 0, 0],
    3: [70, 15, 1, 55, 0, 0],
    4: [100, 20, 1, 80, 0, 0],
    5: [134, 26, 1, 108, 0, 0],
    6: [172, 18, 2, 68, 0, 0],
    7: [196, 20, 2, 78, 0, 0],
    8: [242, 24, 2, 97, 0, 0],
    9: [292, 30, 2, 116, 0, 0],
    10: [346, 18, 2, 68, 2, 69]
  };
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };
  var ECL = { L: 1, M: 0, Q: 3, H: 2 };   /* the two-bit field, L = 01 */

  /* ---- GF(256), primitive polynomial 0x11d ---- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  /* Generator and remainder in the formulation used by qrcodegen: the divisor
   * is stored with its highest-degree coefficient first, and the remainder is a
   * shift register fed one data byte at a time. */
  function rsDivisor(degree) {
    var result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = mul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = mul(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, eccLen) {
    var divisor = rsDivisor(eccLen);
    var result = new Array(eccLen).fill(0);
    for (var d = 0; d < data.length; d++) {
      var factor = data[d] ^ result[0];
      result.shift();
      result.push(0);
      for (var i = 0; i < result.length; i++) result[i] ^= mul(divisor[i], factor);
    }
    return result;
  }

  /* ---- bit stream ---- */
  function Bits() { this.bits = []; }
  Bits.prototype.put = function (value, length) {
    for (var i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  };
  Bits.prototype.bytes = function () {
    var out = [];
    for (var i = 0; i < this.bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | (this.bits[i + j] || 0);
      out.push(b);
    }
    return out;
  };

  function utf8Bytes(text) {
    var out = [], s = String(text);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff) {
        var c2 = s.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function dataCapacity(version) {
    var v = VERSIONS[version];
    return v[2] * v[3] + v[4] * v[5];
  }

  function pickVersion(byteLen) {
    for (var v = 1; v <= 10; v++) {
      var countBits = v < 10 ? 8 : 16;
      var needed = Math.ceil((4 + countBits + byteLen * 8) / 8);
      if (needed <= dataCapacity(v)) return v;
    }
    throw new Error("qr: text too long for version 10 (" + byteLen + " bytes)");
  }

  function codewords(bytes, version) {
    var bits = new Bits();
    bits.put(4, 4);                                     /* byte mode */
    bits.put(bytes.length, version < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) bits.put(bytes[i], 8);

    var cap = dataCapacity(version) * 8;
    var term = Math.min(4, cap - bits.bits.length);
    bits.put(0, term);
    while (bits.bits.length % 8 !== 0) bits.bits.push(0);

    var data = bits.bytes();
    var pads = [0xec, 0x11], p = 0;
    while (data.length < dataCapacity(version)) data.push(pads[p++ % 2]);
    return data;
  }

  function interleave(data, version) {
    var v = VERSIONS[version], eccLen = v[1];
    var b1 = v[2], d1 = v[3], b2 = v[4], d2 = v[5];
    var blocks = [], ecc = [], i;
    var at = 0;
    for (i = 0; i < b1; i++) { var blk = data.slice(at, at + d1); at += d1; blocks.push(blk); }
    for (i = 0; i < b2; i++) { var blk2 = data.slice(at, at + d2); at += d2; blocks.push(blk2); }
    blocks.forEach(function (b) { ecc.push(rsRemainder(b, eccLen)); });

    var out = [], maxData = Math.max(d1, d2 || 0);
    for (i = 0; i < maxData; i++) {
      blocks.forEach(function (b) { if (i < b.length) out.push(b[i]); });
    }
    for (i = 0; i < eccLen; i++) {
      ecc.forEach(function (e) { out.push(e[i]); });
    }
    return out;
  }

  /* ---- matrix construction ---- */
  function blank(size) {
    var m = [];
    for (var r = 0; r < size; r++) {
      var row = [];
      for (var c = 0; c < size; c++) row.push(null);
      m.push(row);
    }
    return m;
  }

  function placeFinder(m, size, row, col) {
    for (var r = -1; r <= 7; r++) {
      for (var c = -1; c <= 7; c++) {
        var rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        var dark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        m[rr][cc] = dark ? 1 : 0;
      }
    }
  }

  function placeAlignment(m, size, version) {
    var pos = ALIGN[version];
    for (var i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        var r = pos[i], c = pos[j];
        if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
        for (var dr = -2; dr <= 2; dr++) {
          for (var dc = -2; dc <= 2; dc++) {
            var dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            m[r + dr][c + dc] = dark ? 1 : 0;
          }
        }
      }
    }
  }

  function placeTiming(m, size) {
    for (var i = 8; i < size - 8; i++) {
      var dark = (i % 2 === 0) ? 1 : 0;
      if (m[6][i] === null) m[6][i] = dark;
      if (m[i][6] === null) m[i][6] = dark;
    }
  }

  function bchFormat(data) {
    var d = data << 10;
    for (var i = 14; i >= 10; i--) if ((d >>> i) & 1) d ^= 0x537 << (i - 10);
    return ((data << 10) | d) ^ 0x5412;
  }

  function bchVersion(version) {
    var d = version << 12;
    for (var i = 17; i >= 12; i--) if ((d >>> i) & 1) d ^= 0x1f25 << (i - 12);
    return (version << 12) | d;
  }

  function placeFormat(m, size, mask) {
    /* The two copies of the 15-bit format word, in the order the spec lays them out. */
    var bits = bchFormat((ECL.L << 3) | mask), i;
    /* vertical strip: bits 0-5 at rows 0-5, 6-7 at rows 7-8, 8-14 up from the bottom */
    for (i = 0; i < 6; i++) m[i][8] = (bits >>> i) & 1;
    m[7][8] = (bits >>> 6) & 1;
    m[8][8] = (bits >>> 7) & 1;
    for (i = 8; i < 15; i++) m[size - 15 + i][8] = (bits >>> i) & 1;
    /* horizontal strip: bits 0-7 right to left, then 8 beside the finder, 9-14 to its left */
    for (i = 0; i < 8; i++) m[8][size - 1 - i] = (bits >>> i) & 1;
    m[8][7] = (bits >>> 8) & 1;
    for (i = 9; i < 15; i++) m[8][14 - i] = (bits >>> i) & 1;
    m[size - 8][8] = 1;                     /* the always-dark module */
  }

  function placeVersion(m, size, version) {
    if (version < 7) return;
    var bits = bchVersion(version);
    for (var i = 0; i < 18; i++) {
      var bit = (bits >>> i) & 1;
      var r = Math.floor(i / 3), c = i % 3;
      m[size - 11 + c][r] = bit;
      m[r][size - 11 + c] = bit;
    }
  }

  /* One grid that says which modules belong to the symbol rather than the data:
   * finders, separators, timing, alignment, format and version blocks. Data
   * placement skips these, and masking must never touch them. */
  var FN_CACHE = {};
  function functionModules(size, version) {
    var key = size + ":" + version;
    if (FN_CACHE[key]) return FN_CACHE[key];
    var f = [], r, c;
    for (r = 0; r < size; r++) f.push(new Array(size).fill(false));
    function mark(r0, c0, h, w) {
      for (var i = 0; i < h; i++) {
        for (var j = 0; j < w; j++) {
          var rr = r0 + i, cc = c0 + j;
          if (rr >= 0 && rr < size && cc >= 0 && cc < size) f[rr][cc] = true;
        }
      }
    }
    mark(0, 0, 9, 9);                       /* top-left finder, separator and format strip */
    mark(0, size - 8, 9, 8);                /* top-right finder */
    mark(size - 8, 0, 8, 9);                /* bottom-left finder, its separator row and the dark module */
    mark(6, 0, 1, size);                    /* timing */
    mark(0, 6, size, 1);
    var pos = ALIGN[version];
    for (var i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        var ar = pos[i], ac = pos[j];
        if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) continue;
        mark(ar - 2, ac - 2, 5, 5);
      }
    }
    if (version >= 7) { mark(0, size - 11, 6, 3); mark(size - 11, 0, 3, 6); }
    FN_CACHE[key] = f;
    return f;
  }

  function placeData(m, size, words, fn) {
    var bitIndex = 0, total = words.length * 8;
    function bit(i) { return (words[i >> 3] >>> (7 - (i & 7))) & 1; }
    var up = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;                      /* skip the timing column */
      for (var i = 0; i < size; i++) {
        var row = up ? size - 1 - i : i;
        for (var k = 0; k < 2; k++) {
          var c = col - k;
          if (fn[row][c]) continue;
          m[row][c] = bitIndex < total ? bit(bitIndex) : 0;
          bitIndex++;
        }
      }
      up = !up;
    }
  }

  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
    function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
    function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; }
  ];

  /* The four penalty rules, used to choose the mask that scans best. */
  function penalty(m, size) {
    var score = 0, r, c, run, i;
    for (r = 0; r < size; r++) {
      run = 1;
      for (c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (c = 0; c < size; c++) {
      run = 1;
      for (r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }
    var pat = [1, 0, 1, 1, 1, 0, 1];
    function hits(get) {
      var n = 0;
      for (var k = 0; k + 11 <= size; k++) {
        var a = true, b = true;
        for (i = 0; i < 7; i++) {
          if (get(k + i) !== pat[i]) a = false;
          if (get(k + 4 + i) !== pat[i]) b = false;
        }
        var qa = true, qb = true;
        for (i = 1; i <= 4; i++) {
          if (k + 7 + i - 1 < size && get(k + 7 + i - 1) !== 0) qa = false;
          if (k - i >= 0 && get(k - i) !== 0) qb = false;
        }
        if (a && qa) n++;
        if (b && qb) n++;
      }
      return n;
    }
    for (r = 0; r < size; r++) score += 40 * hits(function (k) { return m[r][k]; });
    for (c = 0; c < size; c++) score += 40 * hits(function (k) { return m[k][c]; });
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
    var pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function build(bytes, opts) {
    opts = opts || {};
    var version = opts.version || pickVersion(bytes.length);
    var size = version * 4 + 17;
    var fn = functionModules(size, version);
    var words = interleave(codewords(bytes, version), version);

    var best = null, bestScore = Infinity;
    var masks = (opts.mask === undefined) ? [0, 1, 2, 3, 4, 5, 6, 7] : [opts.mask];
    masks.forEach(function (mask) {
      var m = blank(size);
      placeFinder(m, size, 0, 0);
      placeFinder(m, size, 0, size - 7);
      placeFinder(m, size, size - 7, 0);
      placeAlignment(m, size, version);
      placeTiming(m, size);
      placeData(m, size, words, fn);
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          if (!fn[r][c] && MASKS[mask](r, c)) m[r][c] ^= 1;
        }
      }
      placeFormat(m, size, mask);
      placeVersion(m, size, version);
      var score = penalty(m, size);
      if (score < bestScore) { bestScore = score; best = { m: m, mask: mask }; }
    });
    return { size: size, modules: best.m, version: version, mask: best.mask };
  }

  function make(text, opts) {
    var bytes = utf8Bytes(text);
    var out = build(bytes, opts);
    return { size: out.size, modules: out.modules, version: out.version, mask: out.mask };
  }

  /* An SVG of the matrix — used by the board's join panel. */
  function svg(text, opts) {
    opts = opts || {};
    var q = make(text, opts);
    var scale = opts.scale || 4, quiet = opts.quiet === undefined ? 4 : opts.quiet;
    var dim = (q.size + quiet * 2) * scale;
    var path = "";
    for (var r = 0; r < q.size; r++) {
      for (var c = 0; c < q.size; c++) {
        if (q.modules[r][c]) path += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + dim + '" height="' + dim +
      '" viewBox="0 0 ' + (q.size + quiet * 2) + " " + (q.size + quiet * 2) +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code for ' + text + '">' +
      '<rect width="100%" height="100%" fill="#fff"/>' +
      '<path d="' + path + '" fill="#000"/></svg>';
  }

  /* A terminal rendering: two rows per character, using half blocks. */
  function ascii(text, opts) {
    opts = opts || {};
    var q = make(text, opts);
    var quiet = opts.quiet === undefined ? 2 : opts.quiet;
    var size = q.size + quiet * 2;
    var dark = function (r, c) {
      var rr = r - quiet, cc = c - quiet;
      if (rr < 0 || cc < 0 || rr >= q.size || cc >= q.size) return 0;
      return q.modules[rr][cc] ? 1 : 0;
    };
    var lines = [];
    for (var r = 0; r < size; r += 2) {
      var line = "";
      for (var c = 0; c < size; c++) {
        var top = dark(r, c), bottom = dark(r + 1, c);
        line += top && bottom ? "\u2588" : top ? "\u2580" : bottom ? "\u2584" : " ";
      }
      lines.push(line);
    }
    return lines.join("\n");
  }

  return { make: make, svg: svg, ascii: ascii, versions: VERSIONS, ecl: ECL };
});
