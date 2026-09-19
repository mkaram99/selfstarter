/*
 * The membrane.
 *
 * A damped wave equation solved on a square grid clipped to the object the
 * lens has found, driven at a frequency the dial sets. The object's own
 * outline is the boundary condition, which is the whole point: a Chladni
 * figure is a property of the plate's shape, so pointing the instrument at a
 * different thing produces a different figure for the same reason.
 *
 *     u_tt + gamma u_t = c^2 laplacian(u)
 *
 * stepped with the standard leapfrog. Sand collects at the nodes, so the
 * bright filaments in the render are where the amplitude stays near zero.
 *
 * It is also the same mathematics as the orbital layer two files over:
 * eigenmodes of a Laplacian under boundary conditions. A drumhead gives
 * Bessel functions, a sphere gives spherical harmonics, and both are
 * standing waves with nodes.
 */
(function (QM) {
  'use strict';

  var COURANT = 0.42;            // c dt / h, comfortably inside the 2D stability limit
  // The wave has to cross the plate many times over for a standing pattern
  // to establish, so the damping is light and the solver takes several steps
  // per displayed frame to get there in a second or two.
  var STEPS_PER_FRAME = 8;

  function Resonance(n) {
    this.n = 0;
    this.allocate(n || 144);
    this.phase = 0;
    this.response = 0;
    this.responsePeak = 1e-6;
    this.lock = 0;
    this.wavelength = 40;
    this.envMean = 0;
    this.driveCount = 0;
    this.drive = new Int32Array(8);
  }

  Resonance.prototype.allocate = function (n) {
    if (this.n === n) return;
    this.n = n;
    var size = n * n;
    this.u = new Float32Array(size);
    this.prev = new Float32Array(size);
    this.next = new Float32Array(size);
    this.mask = new Float32Array(size);
    this.env2 = new Float32Array(size);
    this.coarse = new Float32Array(size);
    this.scratch = new Float32Array(size);
    this.envMax = 1e-6;
  };

  /*
   * Resample the object mask into the lens's bounding square and fade it out
   * at the rim, so the aperture clamps the plate the way a real one is held
   * at its edge.
   */
  Resonance.prototype.setMask = function (segment, lens, ay) {
    var n = this.n, mask = this.mask;
    var cols = segment.cols, rows = segment.rows, src = segment.mask;
    var span = lens.r * 2;
    var inside = 0;

    for (var j = 0; j < n; j++) {
      var y = lens.v * ay + ((j + 0.5) / n - 0.5) * span;
      var gy = y / ay * rows - 0.5;
      var y0 = Math.floor(gy), ty = gy - y0;
      for (var i = 0; i < n; i++) {
        var idx = j * n + i;
        var x = lens.u + ((i + 0.5) / n - 0.5) * span;
        var dx = (x - lens.u) / lens.r, dy = (y - lens.v * ay) / lens.r;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) { mask[idx] = 0; continue; }

        var gx = x * cols - 0.5;
        var x0 = Math.floor(gx), tx = gx - x0;
        var m = bilinear(src, cols, rows, x0, y0, tx, ty);

        // Soft rim: a hard stair-step edge rings and smears the nodal lines.
        var rim = d > 0.86 ? 1 - (d - 0.86) / 0.14 : 1;
        m *= rim * rim;
        mask[idx] = m;
        if (m > 0.5) inside++;
      }
    }
    this.insideCells = inside;
    // The object mask arrives from a much coarser grid, so without this the
    // plate has a staircase edge -- which both looks wrong and scatters the
    // wave off the steps.
    boxBlur(mask, this.scratch, n, 2);
    this.pickDrive(lens, ay);
  };

  /*
   * Separable box blur with a running sum, edges clamped. Used to soften the
   * plate outline and, on the energy, to ask the question the figure depends
   * on: is this region of the plate ringing at all?
   */
  function boxBlur(buf, tmp, n, r) {
    var span = r * 2 + 1;
    var i, j, k, sum;
    for (j = 0; j < n; j++) {
      var row = j * n;
      sum = 0;
      for (k = -r; k <= r; k++) sum += buf[row + clampIndex(k, n)];
      for (i = 0; i < n; i++) {
        tmp[row + i] = sum / span;
        sum += buf[row + clampIndex(i + r + 1, n)] - buf[row + clampIndex(i - r, n)];
      }
    }
    for (i = 0; i < n; i++) {
      sum = 0;
      for (k = -r; k <= r; k++) sum += tmp[clampIndex(k, n) * n + i];
      for (j = 0; j < n; j++) {
        buf[j * n + i] = sum / span;
        sum += tmp[clampIndex(j + r + 1, n) * n + i] - tmp[clampIndex(j - r, n) * n + i];
      }
    }
  }

  function clampIndex(v, n) { return v < 0 ? 0 : v >= n ? n - 1 : v; }

  function bilinear(src, cols, rows, x0, y0, tx, ty) {
    var x1 = x0 + 1, y1 = y0 + 1;
    x0 = x0 < 0 ? 0 : x0 >= cols ? cols - 1 : x0;
    x1 = x1 < 0 ? 0 : x1 >= cols ? cols - 1 : x1;
    y0 = y0 < 0 ? 0 : y0 >= rows ? rows - 1 : y0;
    y1 = y1 < 0 ? 0 : y1 >= rows ? rows - 1 : y1;
    var a = src[y0 * cols + x0], b = src[y0 * cols + x1];
    var c = src[y1 * cols + x0], d = src[y1 * cols + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  /* Drive points: the centre of the object plus a couple of offsets, so odd
     modes are not accidentally sitting on a node of the driver. */
  Resonance.prototype.pickDrive = function () {
    var n = this.n, mask = this.mask;
    var offsets = [[0.5, 0.5], [0.36, 0.58], [0.63, 0.41]];
    this.driveCount = 0;
    for (var k = 0; k < offsets.length; k++) {
      var i = Math.round(offsets[k][0] * (n - 1));
      var j = Math.round(offsets[k][1] * (n - 1));
      var idx = j * n + i;
      if (mask[idx] > 0.5) this.drive[this.driveCount++] = idx;
    }
    if (!this.driveCount) {
      // Nothing at the sample points: fall back to any cell in the plate.
      for (var m = 0; m < mask.length; m++) {
        if (mask[m] > 0.5) { this.drive[this.driveCount++] = m; break; }
      }
    }
  };

  /*
   * `tone` is the dial: 0 drives near the fundamental, 1 drives many modes
   * up. Higher frequency means shorter wavelength means more nodal lines,
   * which is exactly the relation between energy and node count in a bound
   * quantum state.
   */
  Resonance.prototype.step = function (tone, damping, amplitude) {
    var n = this.n, size = n * n;
    var u = this.u, prev = this.prev, next = this.next, mask = this.mask;
    if (!this.driveCount) return;

    // Wavelength in cells, from about the plate width down to a few cells.
    var radius = n * 0.5;
    // At the top of the dial the drive sits on the fundamental -- a circular
    // membrane's lowest mode is about 2.6 radii -- and climbs from there.
    this.wavelength = Math.max(3.2, radius * 2 / (0.78 + tone * 11));
    var omega = 2 * Math.PI * COURANT / this.wavelength;

    var g = damping;
    var cc = COURANT * COURANT;
    var inv = 1 / (1 + g);
    var keep = (1 - g) * inv;
    var envK = 0.055;
    var peak = 1e-6;
    var sum = 0, count = 0;

    for (var s = 0; s < STEPS_PER_FRAME; s++) {
      for (var j = 1; j < n - 1; j++) {
        var row = j * n;
        for (var i = 1; i < n - 1; i++) {
          var k = row + i;
          var m = mask[k];
          if (m <= 0.002) { next[k] = 0; continue; }
          var lap = u[k - 1] + u[k + 1] + u[k - n] + u[k + n] - 4 * u[k];
          next[k] = ((2 * u[k] + cc * lap) * inv - prev[k] * keep) * m;
        }
      }

      this.phase += omega;
      var push = Math.sin(this.phase) * amplitude;
      for (var d = 0; d < this.driveCount; d++) next[this.drive[d]] += push;

      var t = prev;
      this.prev = prev = u;
      this.u = u = next;
      this.next = next = t;
    }

    var env2 = this.env2;
    for (var e = 0; e < size; e++) {
      if (mask[e] <= 0.002) { env2[e] = 0; continue; }
      var v = u[e];
      env2[e] += (v * v - env2[e]) * envK;
      if (env2[e] > peak) peak = env2[e];
      sum += env2[e];
      count++;
    }

    // Energy averaged over about a wavelength. A nodal line is wider than
    // any pixel neighbourhood, so this is the scale at which "ringing here"
    // is a meaningful question.
    this.coarse.set(this.env2);
    boxBlur(this.coarse, this.scratch, n, Math.max(2, Math.round(this.wavelength * 0.5)));

    this.envMax = Math.sqrt(peak);
    // The drive points are far hotter than the rest of the plate, so the
    // peak is a bad exposure reference. The RMS over the plate is what the
    // figure should be normalised against.
    this.envMean = count ? Math.sqrt(sum / count) : 0;
    this.response = count ? this.envMean / (amplitude + 1e-9) : 0;

    // A slowly decaying high-water mark turns the raw response into
    // something readable: 1 when the drive has found a mode of this shape.
    this.responsePeak = Math.max(this.responsePeak * 0.995, this.response);
    this.lock = this.responsePeak > 1e-6
      ? Math.min(1, this.response / this.responsePeak)
      : 0;
  };

  Resonance.prototype.clear = function () {
    this.u.fill(0);
    this.prev.fill(0);
    this.next.fill(0);
    this.env2.fill(0);
    this.envMean = 0;
    this.response = 0;
    this.lock = 0;
  };

  QM.Resonance = Resonance;
})(window.QM = window.QM || {});
