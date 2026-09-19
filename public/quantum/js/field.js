/*
 * The translation layer.
 *
 * Every frame the scene is reduced to a coarse grid and each cell is read as
 * a small set of physical quantities:
 *
 *   luminance  -> irradiance            -> photon flux, energy density, |E|
 *   hue        -> dominant wavelength   -> photon energy, de Broglie length
 *   saturation -> spectral purity       -> coherence proxy
 *   gradient   -> field direction       -> the field lines drawn over the scene
 *   frame-to-frame change -> agitation  -> thermal motion, decoherence
 *
 * Everything the renderers draw is derived from this grid, so the overlay is
 * a reading of the actual scene rather than an animation played on top of it.
 */
(function (QM) {
  'use strict';

  var C = QM.C, phys = QM.phys;

  // sRGB -> linear, precomputed.
  var LINEAR = new Float32Array(256);
  for (var i = 0; i < 256; i++) {
    var s = i / 255;
    LINEAR[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  function Field(cols) {
    this.cols = cols || 64;
    this.rows = 48;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.lum = null;
    this.prevLum = null;
    this.hue = null;
    this.sat = null;
    this.gx = null;
    this.gy = null;
    this.delta = null;
    this.r = null; this.g = null; this.b = null;
    this.stats = {
      meanLum: 0.3, meanSat: 0.3, meanDelta: 0, meanHue: 40,
      minLum: 0, maxLum: 1, maxGrad: 0.001, sources: []
    };
  }

  Field.prototype.resize = function (aspect) {
    var rows = Math.max(24, Math.min(72, Math.round(this.cols / (aspect || 1.5))));
    if (rows === this.rows && this.lum) return;
    this.rows = rows;
    this.canvas.width = this.cols;
    this.canvas.height = this.rows;
    var n = this.cols * this.rows;
    this.lum = new Float32Array(n);
    this.prevLum = new Float32Array(n);
    this.hue = new Float32Array(n);
    this.sat = new Float32Array(n);
    this.gx = new Float32Array(n);
    this.gy = new Float32Array(n);
    this.delta = new Float32Array(n);
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
  };

  /* Pull one frame from the source and recompute every channel. */
  Field.prototype.update = function (source, aspect) {
    this.resize(aspect);
    var w = this.cols, h = this.rows, n = w * h;
    this.ctx.clearRect(0, 0, w, h);
    if (!source.drawTo(this.ctx, w, h)) return false;

    var data;
    try {
      data = this.ctx.getImageData(0, 0, w, h).data;
    } catch (err) {
      return false; // tainted canvas; keep the previous field
    }

    var tmp = this.prevLum;
    this.prevLum = this.lum;
    this.lum = tmp;

    var sumL = 0, sumS = 0, sumD = 0, sumHx = 0, sumHy = 0;
    var minL = 1e9, maxL = -1e9;
    for (var i = 0, p = 0; i < n; i++, p += 4) {
      var rl = LINEAR[data[p]], gl = LINEAR[data[p + 1]], bl = LINEAR[data[p + 2]];
      this.r[i] = rl; this.g[i] = gl; this.b[i] = bl;

      var lum = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      this.lum[i] = lum;
      sumL += lum;
      if (lum < minL) minL = lum;
      if (lum > maxL) maxL = lum;

      var max = rl > gl ? (rl > bl ? rl : bl) : (gl > bl ? gl : bl);
      var min = rl < gl ? (rl < bl ? rl : bl) : (gl < bl ? gl : bl);
      var chroma = max - min;
      var sat = max > 1e-6 ? chroma / max : 0;
      this.sat[i] = sat;
      sumS += sat;

      var hue = 0;
      if (chroma > 1e-6) {
        if (max === rl) hue = 60 * (((gl - bl) / chroma) % 6);
        else if (max === gl) hue = 60 * ((bl - rl) / chroma + 2);
        else hue = 60 * ((rl - gl) / chroma + 4);
        if (hue < 0) hue += 360;
      }
      this.hue[i] = hue;
      // Hue is circular, so the scene average has to be taken as a vector.
      var rad = hue * Math.PI / 180;
      sumHx += Math.cos(rad) * sat;
      sumHy += Math.sin(rad) * sat;

      var d = Math.abs(lum - this.prevLum[i]);
      this.delta[i] = this.delta[i] * 0.6 + d * 0.4;
      sumD += this.delta[i];
    }

    this.computeGradient();

    var st = this.stats;
    st.meanLum = sumL / n;
    st.minLum = minL;
    st.maxLum = maxL;
    st.meanSat = sumS / n;
    st.meanDelta = sumD / n;
    if (sumHx !== 0 || sumHy !== 0) {
      var mh = Math.atan2(sumHy, sumHx) * 180 / Math.PI;
      st.meanHue = mh < 0 ? mh + 360 : mh;
    }
    this.findSources(6);
    return true;
  };

  /* Sobel on luminance. The result doubles as the local field direction. */
  Field.prototype.computeGradient = function () {
    var w = this.cols, h = this.rows, L = this.lum, maxg = 1e-6;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        var x0 = x > 0 ? x - 1 : x, x1 = x < w - 1 ? x + 1 : x;
        var y0 = y > 0 ? y - 1 : y, y1 = y < h - 1 ? y + 1 : y;
        var tl = L[y0 * w + x0], tc = L[y0 * w + x], tr = L[y0 * w + x1];
        var ml = L[i - (x > 0 ? 1 : 0)], mr = L[i + (x < w - 1 ? 1 : 0)];
        var bl = L[y1 * w + x0], bc = L[y1 * w + x], br = L[y1 * w + x1];
        var gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        var gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
        this.gx[i] = gx;
        this.gy[i] = gy;
        var m = gx * gx + gy * gy;
        if (m > maxg) maxg = m;
      }
    }
    this.stats.maxGrad = Math.sqrt(maxg);
  };

  /*
   * Brightest well-separated cells. The wave and photon layers treat these as
   * the emitters in the scene. Block-wise maxima keep the emitters spread out
   * and avoid sorting the whole grid every frame.
   */
  Field.prototype.findSources = function (k) {
    var w = this.cols, h = this.rows, L = this.lum;
    var bx = 4, by = 3;
    var found = this._srcScratch || (this._srcScratch = []);
    found.length = 0;
    for (var byi = 0; byi < by; byi++) {
      for (var bxi = 0; bxi < bx; bxi++) {
        var x0 = Math.floor(bxi * w / bx), x1 = Math.floor((bxi + 1) * w / bx);
        var y0 = Math.floor(byi * h / by), y1 = Math.floor((byi + 1) * h / by);
        var best = -1, bestI = -1;
        for (var y = y0; y < y1; y++) {
          for (var x = x0; x < x1; x++) {
            var i = y * w + x;
            if (L[i] > best) { best = L[i]; bestI = i; }
          }
        }
        if (bestI < 0) continue;
        var sx = bestI % w, sy = (bestI / w) | 0;
        found.push({
          cx: sx, cy: sy,
          u: (sx + 0.5) / w, v: (sy + 0.5) / h,
          lum: best, hue: this.hue[bestI], sat: this.sat[bestI]
        });
      }
    }
    found.sort(function (a, b) { return b.lum - a.lum; });
    this.stats.sources = found.slice(0, k);
  };

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* Bilinear read of any channel at normalised coordinates. */
  Field.prototype.sample = function (channel, u, v) {
    var arr = this[channel];
    if (!arr) return 0;
    var w = this.cols, h = this.rows;
    var fx = clamp01(u) * (w - 1), fy = clamp01(v) * (h - 1);
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    var tx = fx - x0, ty = fy - y0;
    var a = arr[y0 * w + x0], b = arr[y0 * w + x1];
    var c = arr[y1 * w + x0], d = arr[y1 * w + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };

  /* Nearest-cell read; hue must not be interpolated across the 360/0 seam. */
  Field.prototype.nearest = function (channel, u, v) {
    var arr = this[channel];
    if (!arr) return 0;
    var x = Math.round(clamp01(u) * (this.cols - 1));
    var y = Math.round(clamp01(v) * (this.rows - 1));
    return arr[y * this.cols + x];
  };

  Field.prototype.indexAt = function (u, v) {
    var x = Math.round(clamp01(u) * (this.cols - 1));
    var y = Math.round(clamp01(v) * (this.rows - 1));
    return y * this.cols + x;
  };

  /*
   * The readout: one point of the scene expressed as quantum observables.
   * `dx` is the real-world size of a screen pixel at the current magnification,
   * which is what sets the uncertainty bound.
   */
  Field.prototype.probe = function (u, v, dx) {
    var lum = this.sample('lum', u, v);
    var hue = this.nearest('hue', u, v);
    var sat = this.sample('sat', u, v);
    var delta = this.sample('delta', u, v);
    var gx = this.sample('gx', u, v), gy = this.sample('gy', u, v);

    var irradiance = Math.max(1e-6, lum) * C.irradianceRef;
    var lambda = phys.hueToWavelength(hue);
    var eGamma = phys.photonEnergy(lambda);
    var flux = phys.photonFlux(irradiance, lambda);
    var u_em = phys.energyDensity(irradiance);
    var eField = phys.fieldAmplitude(irradiance);
    var lambdaDB = phys.deBroglie(eGamma, C.me);
    var temperature = C.T0 * (1 + delta * 9);
    var dp = dx > 0 ? phys.momentumBound(dx) : Infinity;

    return {
      lum: lum, hue: hue, sat: sat, delta: delta,
      grad: Math.sqrt(gx * gx + gy * gy),
      gradAngle: Math.atan2(gy, gx),
      irradiance: irradiance,
      wavelength: lambda,
      photonEnergy: eGamma,
      photonEnergyEv: phys.joulesToEv(eGamma),
      photonFlux: flux,
      energyDensity: u_em,
      eField: eField,
      deBroglie: lambdaDB,
      coherence: clamp01(sat * (1 - Math.min(1, delta * 12))),
      decoherence: delta,
      temperature: temperature,
      thermalEv: phys.joulesToEv(phys.thermalEnergy(temperature)),
      dx: dx,
      dp: dp,
      dpc: phys.joulesToEv(dp * C.c),
      confinement: phys.joulesToEv(phys.confinementEnergy(dx, C.me))
    };
  };

  QM.Field = Field;
  QM.clamp01 = clamp01;
})(window.QM = window.QM || {});
