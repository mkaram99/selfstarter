/*
 * The figure.
 *
 * Renders the membrane as a Chladni plate -- bright filaments where the
 * amplitude stays near zero, a dim field of the object's own colour where it
 * does not -- and lays the object's angular symmetry over it as harmonic
 * line-work. The fold count is measured from the outline, not chosen, so the
 * geometry belongs to the thing being looked at.
 */
(function (QM) {
  'use strict';

  var U = QM.util;
  var TAU = Math.PI * 2;

  /*
   * Sand gathers at the nodes of a plate that is ringing. A node is a zero
   * surrounded by amplitude, so the local mean has to gate the filament --
   * otherwise a still membrane reads as one continuous bright sheet.
   */
  /*
   * The gate is the energy averaged over a wavelength, not the energy at
   * the pixel. A node is a zero surrounded by amplitude, and the nodal
   * region is wider than any pixel neighbourhood -- gate too tightly and it
   * erases the lines it exists to protect, too loosely and the parts of the
   * plate the wave has not reached blaze white.
   */
  function paint(res, image, hue, sharpness) {
    var n = res.n, env2 = res.env2, mask = res.mask, data = image.data;
    var coarse = res.coarse;
    // Exposure set from the RMS of the plate, so a typical antinode sits at
    // about half scale however hard the thing is being driven.
    var ref = res.envMean * 2.1;
    var norm = 1 / (ref * ref + 1e-12);
    var tint = hueTint(hue);

    for (var j = 0; j < n; j++) {
      for (var i = 0; i < n; i++) {
        var k = j * n + i;
        var m = mask[k];
        var p = k * 4;
        if (m <= 0.01) { data[p + 3] = 0; continue; }

        var amp = Math.min(1, Math.sqrt(env2[k] * norm));
        var ringing = Math.min(1, coarse[k] * norm / 0.09);
        var node = Math.pow(1 - amp, sharpness) * ringing;
        var anti = amp;

        // Antinodal field in the object's colour, nodal filament in sand.
        var glow = Math.pow(anti, 0.85) * 0.42;
        var r = tint[0] * glow + 255 * node;
        var g = tint[1] * glow + 238 * node;
        var b = tint[2] * glow + 198 * node;
        var alpha = (glow * 0.85 + node) * m;

        data[p] = r > 255 ? 255 : r;
        data[p + 1] = g > 255 ? 255 : g;
        data[p + 2] = b > 255 ? 255 : b;
        data[p + 3] = alpha > 1 ? 255 : alpha * 255;
      }
    }
  }

  var tintCache = { hue: -1, rgb: [200, 200, 255] };
  function hueTint(hue) {
    var rounded = Math.round(hue / 6) * 6;
    if (tintCache.hue === rounded) return tintCache.rgb;
    var m = /rgba\((\d+),(\d+),(\d+)/.exec(
      U.wavelengthColor(QM.phys.hueToWavelength(rounded), 1));
    tintCache.hue = rounded;
    tintCache.rgb = m ? [+m[1], +m[2], +m[3]] : [200, 200, 255];
    return tintCache.rgb;
  }

  QM.layers.register('cymatic', {
    buffer: null,
    draw: function (ctx, f) {
      var res = f.resonance, seg = f.segment, lens = f.lens, view = f.view;
      if (!res || !seg || !seg.stats.found || !res.insideCells) return;
      var n = res.n;

      if (!this.buffer || this.buffer.width !== n) {
        this.buffer = document.createElement('canvas');
        this.buffer.width = this.buffer.height = n;
        this.bufferCtx = this.buffer.getContext('2d');
        this.image = this.bufferCtx.createImageData(n, n);
      }

      // Sharper filaments once the drive has actually found a mode; a plate
      // driven off resonance genuinely has blurrier nodal lines.
      if (!(res.envMean > 1e-5)) return;     // nothing is moving yet
      var sharpness = 4 + res.lock * 7;
      paint(res, this.image, seg.stats.hue, sharpness);
      this.bufferCtx.putImageData(this.image, 0, 0);

      var box = lens.box;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = f.weight * (0.72 + res.lock * 0.28);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(this.buffer, 0, 0, n, n, box.x, box.y, box.size, box.size);
      ctx.restore();
    }
  });

  /*
   * The object's outline and its angular harmonics. The rings sit at whole
   * multiples of the driving wavelength, so the figure tightens as the dial
   * climbs in the same way the nodal lines behind it do.
   */
  QM.layers.register('harmonics', {
    draw: function (ctx, f) {
      var seg = f.segment, res = f.resonance, lens = f.lens, view = f.view;
      var st = seg && seg.stats;
      if (!st || !st.found) return;

      var toX = function (x) { return x * view.w; };
      var toY = function (y) { return y / f.aspectY * view.h; };
      var cx = toX(st.cx), cy = toY(st.cy);
      var rays = QM.SEGMENT_RAYS;
      var spin = f.t * 0.06;

      ctx.save();
      ctx.lineJoin = 'round';

      // The silhouette: the boundary condition made visible.
      ctx.beginPath();
      for (var k = 0; k <= rays; k++) {
        var i = k % rays;
        var px = toX(seg.outline[i * 2]), py = toY(seg.outline[i * 2 + 1]);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.lineWidth = Math.max(1, view.dpr * 1.1);
      ctx.strokeStyle = 'rgba(255,214,140,' + (f.weight * 0.5).toFixed(3) + ')';
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';
      var gold = function (a) { return 'rgba(255,206,130,' + U.clamp(a, 0, 1).toFixed(3) + ')'; };
      var radiusPx = st.radius * view.w;

      // Concentric rings at the driving wavelength.
      if (res && res.insideCells) {
        var lambdaPx = (res.wavelength / res.n) * lens.box.size;
        if (lambdaPx > 6) {
          ctx.lineWidth = Math.max(1, view.dpr * 0.7);
          ctx.strokeStyle = gold(f.weight * 0.16 * (0.4 + res.lock * 0.6));
          ctx.beginPath();
          for (var r = lambdaPx * 0.5; r < radiusPx * 1.15; r += lambdaPx) {
            ctx.moveTo(cx + r, cy);
            ctx.arc(cx, cy, r, 0, TAU);
          }
          ctx.stroke();
        }
      }

      // The measured fold count, drawn as spokes and as a rose curve of the
      // same order. A smooth object scores almost nothing here and the
      // figure stays plain, which is the honest result.
      var fold = st.symmetry;
      var strength = st.symmetryStrength;
      if (fold >= 2 && strength > 0.06) {
        ctx.lineWidth = Math.max(1, view.dpr * 0.8);
        ctx.strokeStyle = gold(f.weight * strength * 0.5);
        ctx.beginPath();
        for (var s = 0; s < fold; s++) {
          var a = spin + s * TAU / fold;
          ctx.moveTo(cx + Math.cos(a) * radiusPx * 0.12, cy + Math.sin(a) * radiusPx * 0.12);
          ctx.lineTo(cx + Math.cos(a) * radiusPx * 0.98, cy + Math.sin(a) * radiusPx * 0.98);
        }
        ctx.stroke();

        ctx.strokeStyle = gold(f.weight * strength * 0.65);
        ctx.lineWidth = Math.max(1, view.dpr);
        ctx.beginPath();
        for (var q = 0; q <= 180; q++) {
          var th = q / 180 * TAU;
          var rr = radiusPx * (0.52 + 0.4 * Math.cos(fold * (th - spin)));
          var mx = cx + Math.cos(th) * rr, my = cy + Math.sin(th) * rr;
          if (q === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }
  });
})(window.QM = window.QM || {});
