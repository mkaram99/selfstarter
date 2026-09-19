/*
 * The trigger.
 *
 * Finds the object under the lens and describes it well enough to drive
 * everything else: a mask of the cells that belong to it, its outline as a
 * radial profile, and the handful of properties that decide what the
 * instrument then draws. Region growing from the centre of the aperture,
 * stopped by colour difference and by the scene's own edges.
 *
 * All geometry here is in aspect-corrected units -- x across the frame in
 * [0,1], y scaled by the same factor -- so that a circle on screen is a
 * circle in these coordinates and shape measurements are not stretched.
 */
(function (QM) {
  'use strict';

  var RAYS = 72;                 // angular samples of the outline
  var HARMONICS = 8;             // angular orders tested for the object's symmetry

  function Segment() {
    this.mask = null;
    this.queue = null;
    this.cols = 0;
    this.rows = 0;
    this.radii = new Float32Array(RAYS);
    this.smooth = new Float32Array(RAYS);
    this.outline = new Float32Array(RAYS * 2);
    this.settled = false;
    this.stats = {
      found: false, synthetic: true, cells: 0, fill: 0,
      cx: 0.5, cy: 0.5, radius: 0.1,
      area: 0, perimeter: 0, compactness: 1,
      hue: 40, sat: 0.3, lum: 0.3, texture: 0, motion: 0,
      symmetry: 0, symmetryStrength: 0, roughness: 0
    };
  }

  Segment.prototype.allocate = function (cols, rows) {
    if (this.cols === cols && this.rows === rows) return;
    this.cols = cols;
    this.rows = rows;
    this.mask = new Uint8Array(cols * rows);
    this.queue = new Int32Array(cols * rows);
  };

  /*
   * Grow a region out from the seed. The tolerance is tried tight first and
   * loosened only if the object comes back implausibly small, so a strongly
   * coloured object keeps its own edge instead of bleeding into the
   * background the moment the two are similar.
   */
  Segment.prototype.grow = function (field, seed, lens, ay, tolerance) {
    var cols = this.cols, rows = this.rows, mask = this.mask, queue = this.queue;
    mask.fill(0);

    var gradLimit = field.stats.maxGrad * 0.55 + 1e-6;
    var r2 = lens.r * lens.r;
    var sr = field.r[seed], sg = field.g[seed], sb = field.b[seed];
    var sumR = sr, sumG = sg, sumB = sb;

    var head = 0, tail = 0;
    queue[tail++] = seed;
    mask[seed] = 1;
    var count = 1;
    var maxCells = Math.floor(cols * rows * 0.6);

    while (head < tail && count < maxCells) {
      var i = queue[head++];
      var x = i % cols, y = (i / cols) | 0;
      var mr = sumR / count, mg = sumG / count, mb = sumB / count;

      for (var d = 0; d < 4; d++) {
        var nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        var ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        var j = ny * cols + nx;
        if (mask[j]) continue;

        // Stay inside the aperture: the instrument only claims what it sees.
        var px = (nx + 0.5) / cols - lens.u;
        var py = ((ny + 0.5) / rows) * ay - lens.v * ay;
        if (px * px + py * py > r2) continue;

        // An edge in the scene is a boundary of the object more often than not.
        var gx = field.gx[j], gy = field.gy[j];
        if (Math.sqrt(gx * gx + gy * gy) > gradLimit) continue;

        var dr = field.r[j] - mr, dg = field.g[j] - mg, db = field.b[j] - mb;
        if (dr * dr + dg * dg + db * db > tolerance * tolerance) continue;

        mask[j] = 1;
        queue[tail++] = j;
        sumR += field.r[j]; sumG += field.g[j]; sumB += field.b[j];
        count++;
      }
    }
    return count;
  };

  Segment.prototype.update = function (field, lens, aspectY) {
    this.allocate(field.cols, field.rows);
    var cols = this.cols, rows = this.rows;
    var ay = aspectY;
    var st = this.stats;

    var seed = field.indexAt(lens.u, lens.v);
    var lensCells = Math.PI * lens.r * lens.r * cols * rows / ay;
    var count = 0;

    // Two passes: a tight read first, loosened once if it found almost nothing.
    var tolerances = [0.085, 0.2];
    for (var t = 0; t < tolerances.length; t++) {
      count = this.grow(field, seed, lens, ay, tolerances[t]);
      if (count > lensCells * 0.06) break;
    }

    st.cells = count;
    st.fill = lensCells > 0 ? Math.min(1, count / lensCells) : 0;

    // Nothing separable under the aperture: fall back to the aperture
    // itself, which is a perfectly good circular plate and gives the
    // figure something honest to be a figure of.
    if (count <= Math.max(6, lensCells * 0.02)) {
      this.fallback(field, lens, ay);
      return st;
    }

    st.found = true;
    st.synthetic = false;
    this.measure(field, lens, ay);
    return st;
  };

  /* The aperture as the plate, when no object stands out from its surround. */
  Segment.prototype.fallback = function (field, lens, ay) {
    var cols = this.cols, rows = this.rows, mask = this.mask, st = this.stats;
    var r2 = lens.r * lens.r;
    var count = 0;
    mask.fill(0);
    for (var j = 0; j < rows; j++) {
      var py = ((j + 0.5) / rows) * ay - lens.v * ay;
      for (var i = 0; i < cols; i++) {
        var px = (i + 0.5) / cols - lens.u;
        if (px * px + py * py <= r2) { mask[j * cols + i] = 1; count++; }
      }
    }
    st.found = true;
    st.synthetic = true;
    st.cells = count;
    this.measure(field, lens, ay);
  };

  Segment.prototype.measure = function (field, lens, ay) {
    var cols = this.cols, rows = this.rows, mask = this.mask, st = this.stats;
    var sumX = 0, sumY = 0, n = 0;
    var sumL = 0, sumS = 0, sumG = 0, sumD = 0, hx = 0, hy = 0;

    for (var i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      var x = ((i % cols) + 0.5) / cols;
      var y = (((i / cols) | 0) + 0.5) / rows * ay;
      sumX += x; sumY += y; n++;
      sumL += field.lum[i];
      sumS += field.sat[i];
      sumD += field.delta[i];
      var gx = field.gx[i], gy = field.gy[i];
      sumG += Math.sqrt(gx * gx + gy * gy);
      var rad = field.hue[i] * Math.PI / 180;
      hx += Math.cos(rad) * field.sat[i];
      hy += Math.sin(rad) * field.sat[i];
    }

    st.cx = sumX / n;
    st.cy = sumY / n;
    st.lum = sumL / n;
    st.sat = sumS / n;
    st.motion = sumD / n;
    st.texture = field.stats.maxGrad > 0 ? (sumG / n) / field.stats.maxGrad : 0;
    if (hx !== 0 || hy !== 0) {
      var mh = Math.atan2(hy, hx) * 180 / Math.PI;
      st.hue = mh < 0 ? mh + 360 : mh;
    }

    this.castRays(lens, ay);
    this.analyseOutline(st);

    // Cell area in aspect-corrected units, so area and perimeter are
    // comparable and compactness means what it should.
    var cellArea = (1 / cols) * (ay / rows);
    st.area = n * cellArea;
    st.compactness = st.perimeter > 0
      ? Math.min(1, 4 * Math.PI * st.area / (st.perimeter * st.perimeter))
      : 1;
  };

  /*
   * The outline as a radius per angle, measured from the centroid. It is a
   * star-shaped approximation, which is what most things under a lens are,
   * and it gives the outline, the perimeter and the object's angular
   * symmetry from one cheap sweep.
   */
  Segment.prototype.castRays = function (lens, ay) {
    var cols = this.cols, rows = this.rows, mask = this.mask, st = this.stats;
    var step = 0.4 / cols;
    var maxR = lens.r * 1.02;
    var sumR = 0, perim = 0;

    for (var k = 0; k < RAYS; k++) {
      var a = k / RAYS * Math.PI * 2;
      var dx = Math.cos(a) * step, dy = Math.sin(a) * step;
      var x = st.cx, y = st.cy;
      var r = 0, misses = 0;

      while (r < maxR) {
        x += dx; y += dy; r += step;
        var cx = Math.floor(x * cols);
        var cy = Math.floor(y / ay * rows);
        if (cx < 0 || cx >= cols || cy < 0 || cy >= rows || !mask[cy * cols + cx]) {
          // Tolerate a one-cell hole before calling it the edge.
          if (++misses >= 2) { r -= step * misses; break; }
        } else {
          misses = 0;
        }
      }
      // A little temporal smoothing: the grow is a hard threshold and the
      // raw outline flickers by a cell or two every frame.
      if (!this.settled) this.smooth[k] = r;
      else this.smooth[k] += (r - this.smooth[k]) * 0.35;
      r = this.smooth[k];

      this.radii[k] = r;
      this.outline[k * 2] = st.cx + Math.cos(a) * r;
      this.outline[k * 2 + 1] = st.cy + Math.sin(a) * r;
      sumR += r;
    }
    this.settled = true;

    for (var j = 0; j < RAYS; j++) {
      var j2 = (j + 1) % RAYS;
      var ox = this.outline[j2 * 2] - this.outline[j * 2];
      var oy = this.outline[j2 * 2 + 1] - this.outline[j * 2 + 1];
      perim += Math.sqrt(ox * ox + oy * oy);
    }
    st.radius = sumR / RAYS;
    st.perimeter = perim;
  };

  /*
   * The object's own symmetry, read off the outline as an angular Fourier
   * series. The strongest order is the fold count the figure is then drawn
   * with -- something six-sided resonates six-fold, and a smooth blob picks
   * up almost nothing, which is also correct.
   */
  Segment.prototype.analyseOutline = function (st) {
    var mean = st.radius || 1e-6;
    var best = 0, bestMag = 0, total = 0;

    for (var k = 2; k <= HARMONICS; k++) {
      var re = 0, im = 0;
      for (var j = 0; j < RAYS; j++) {
        var a = j / RAYS * Math.PI * 2;
        var dev = (this.radii[j] - mean) / mean;
        re += dev * Math.cos(k * a);
        im += dev * Math.sin(k * a);
      }
      var mag = Math.sqrt(re * re + im * im) * 2 / RAYS;
      total += mag;
      if (mag > bestMag) { bestMag = mag; best = k; }
    }

    var variance = 0;
    for (var i = 0; i < RAYS; i++) {
      var dv = (this.radii[i] - mean) / mean;
      variance += dv * dv;
    }

    st.roughness = Math.min(1, Math.sqrt(variance / RAYS) * 2.2);
    st.symmetry = best;

    // How much this one order stands out from the rest, not how big it is:
    // an ellipse has a strong second harmonic but no interesting symmetry,
    // and a genuinely six-sided thing should outscore it. Gated by edge
    // roughness so a near-circle reports nothing at all.
    var share = total > 1e-6 ? bestMag / total : 0;
    var flat = 1 / (HARMONICS - 1);
    st.symmetryStrength = Math.max(0, Math.min(1,
      (share - flat) / 0.45 * Math.min(1, st.roughness * 2.5)));
  };

  QM.Segment = Segment;
  QM.SEGMENT_RAYS = RAYS;
})(window.QM = window.QM || {});
