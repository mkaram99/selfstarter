/*
 * Layers for the scales where matter still looks like matter: the field
 * overlay, photon transport, cellular structure, light as a wave, and the
 * molecular lattice.
 */
(function (QM) {
  'use strict';

  var U = QM.util, C = QM.C;
  var TAU = Math.PI * 2;

  /* Swap the alpha on an 'rgba(r,g,b,a)' string. */
  function fade(color, alpha) {
    return color.replace(/[\d.]+\)$/, U.clamp(alpha, 0, 1).toFixed(3) + ')');
  }

  /* ---------------------------------------------------------------- field */
  /* Streamlines of the luminance gradient: the scene's structure redrawn as
     the field it would produce. Present at every magnification. */
  QM.layers.register('fieldlines', {
    seeds: [],
    reset: function (view) {
      var cols = Math.max(10, Math.round(view.w / 74));
      var rows = Math.max(7, Math.round(view.h / 74));
      var rnd = U.mulberry32(0x51ee7);
      this.seeds = [];
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          this.seeds.push({
            u: (x + 0.25 + rnd() * 0.5) / cols,
            v: (y + 0.25 + rnd() * 0.5) / rows,
            phase: rnd() * TAU
          });
        }
      }
    },
    draw: function (ctx, f) {
      var field = f.field, view = f.view;
      var maxg = field.stats.maxGrad || 1e-6;
      var steps = 9;
      var step = 0.016;
      ctx.save();
      ctx.globalAlpha = f.weight * 0.9;
      ctx.lineWidth = Math.max(1, view.dpr * 0.8);
      ctx.lineCap = 'round';

      for (var s = 0; s < this.seeds.length; s++) {
        var seed = this.seeds[s];
        var u = seed.u, v = seed.v;
        var gx0 = field.sample('gx', u, v), gy0 = field.sample('gy', u, v);
        var mag = Math.sqrt(gx0 * gx0 + gy0 * gy0) / maxg;
        if (mag < 0.06) continue;

        ctx.beginPath();
        ctx.moveTo(u * view.w, v * view.h);
        for (var i = 0; i < steps; i++) {
          var gx = field.sample('gx', u, v), gy = field.sample('gy', u, v);
          var len = Math.sqrt(gx * gx + gy * gy);
          if (len < 1e-5) break;
          u += (gx / len) * step;
          v += (gy / len) * step * (view.w / view.h);
          if (u < 0 || u > 1 || v < 0 || v > 1) break;
          ctx.lineTo(u * view.w, v * view.h);
        }
        var pulse = 0.55 + 0.45 * Math.sin(f.t * 1.6 + seed.phase);
        var hue = 175 + 40 * mag;
        ctx.strokeStyle = U.hsla(hue, 90, 62, Math.min(0.5, mag * 0.55) * pulse);
        ctx.stroke();
      }
      ctx.restore();
    }
  });

  /* -------------------------------------------------------------- photons */
  /* Light resolved into quanta, leaving the bright parts of the scene. The
     display necessarily runs many orders of magnitude slow; the HUD reports
     by how much. */
  QM.layers.register('photons', {
    pool: [],
    reset: function (view) {
      var target = Math.round(U.clamp(view.w * view.h / 5200, 60, 420) * view.quality);
      this.pool = [];
      var rnd = U.mulberry32(0xb0501);
      for (var i = 0; i < target; i++) {
        this.pool.push({ life: rnd() * 2, max: 1, u: rnd(), v: rnd(), vx: 0, vy: 0, lambda: 5.5e-7, bright: 0.5 });
      }
    },
    spawn: function (p, field, rnd) {
      // Rejection-sample a bright cell: photons come from where the light is.
      var u = 0.5, v = 0.5, lum = 0;
      for (var tries = 0; tries < 8; tries++) {
        u = rnd(); v = rnd();
        lum = field.sample('lum', u, v);
        if (lum > rnd() * 0.85) break;
      }
      var gx = field.sample('gx', u, v), gy = field.sample('gy', u, v);
      var len = Math.sqrt(gx * gx + gy * gy);
      var dx, dy;
      if (len > 1e-4) { dx = -gx / len; dy = -gy / len; }   // outward, away from the source
      else { var a = rnd() * TAU; dx = Math.cos(a); dy = Math.sin(a); }
      var spread = (rnd() - 0.5) * 0.9;
      var ca = Math.cos(spread), sa = Math.sin(spread);
      p.u = u; p.v = v;
      p.vx = dx * ca - dy * sa;
      p.vy = dx * sa + dy * ca;
      p.lambda = QM.phys.hueToWavelength(field.nearest('hue', u, v));
      p.bright = 0.35 + lum * 0.65;
      p.max = 0.7 + rnd() * 0.9;
      p.life = p.max;
    },
    draw: function (ctx, f) {
      var field = f.field, view = f.view;
      var rnd = Math.random;
      var speed = 0.30;
      var trail = 0.035 + 0.02 * Math.min(1, field.stats.meanLum * 2);
      var aspect = view.w / view.h;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      var active = Math.round(this.pool.length * U.clamp(0.25 + field.stats.meanLum * 1.6, 0.25, 1));

      for (var i = 0; i < active; i++) {
        var p = this.pool[i];
        p.life -= f.dt;
        if (p.life <= 0 || p.u < -0.1 || p.u > 1.1 || p.v < -0.1 || p.v > 1.1) {
          this.spawn(p, field, rnd);
        }
        p.u += p.vx * speed * f.dt;
        p.v += p.vy * speed * f.dt * aspect;

        var fade = Math.sin(Math.PI * U.clamp(p.life / p.max, 0, 1));
        var a = f.weight * fade * p.bright * 0.85;
        if (a < 0.01) continue;
        var x = p.u * view.w, y = p.v * view.h;
        ctx.strokeStyle = U.wavelengthColor(p.lambda, a);
        ctx.lineWidth = Math.max(1, view.dpr * (0.9 + p.bright));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx * trail * view.w, y - p.vy * trail * view.h * aspect);
        ctx.stroke();
      }
      ctx.restore();
    }
  });

  /* ---------------------------------------------------------------- cells */
  /* The last rung where the overlay draws objects. Blobs settle where the
     scene has texture; they are a reading of the image's structure. */
  QM.layers.register('cells', {
    sites: [],
    reset: function (view) {
      var count = Math.round(U.clamp(view.w * view.h / 26000, 8, 44) * view.quality);
      var rnd = U.mulberry32(0xce115);
      this.sites = [];
      for (var i = 0; i < count; i++) {
        this.sites.push({
          u: rnd(), v: rnd(),
          r: 0.05 + rnd() * 0.07,
          phase: rnd() * TAU,
          spin: (rnd() - 0.5) * 0.4,
          harm: [0.12 + rnd() * 0.1, 0.06 + rnd() * 0.08, 0.04 + rnd() * 0.05]
        });
      }
    },
    draw: function (ctx, f) {
      var field = f.field, view = f.view;
      var scale = Math.min(view.w, view.h);
      ctx.save();
      for (var i = 0; i < this.sites.length; i++) {
        var s = this.sites[i];
        var lum = field.sample('lum', s.u, s.v);
        if (lum < 0.05) continue;
        var hue = field.nearest('hue', s.u, s.v);
        var sat = field.sample('sat', s.u, s.v);
        var agit = field.sample('delta', s.u, s.v);
        var cx = s.u * view.w, cy = s.v * view.h;
        var r = s.r * scale * (0.7 + lum * 0.8);
        var rot = f.t * s.spin + s.phase;

        ctx.beginPath();
        for (var k = 0; k <= 48; k++) {
          var th = (k / 48) * TAU;
          var wob = 1 +
            s.harm[0] * Math.sin(3 * th + rot) +
            s.harm[1] * Math.sin(5 * th - rot * 1.7) +
            s.harm[2] * Math.sin(7 * th + rot * 0.6 + agit * 12);
          var px = cx + Math.cos(th) * r * wob;
          var py = cy + Math.sin(th) * r * wob;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = U.hsla(hue, 60 + sat * 30, 55, f.weight * 0.07 * (0.4 + lum));
        ctx.fill();
        ctx.lineWidth = Math.max(1, view.dpr);
        ctx.strokeStyle = U.hsla(hue + 15, 85, 70, f.weight * 0.38 * (0.35 + lum));
        ctx.stroke();

        // Nucleus and a little cytoplasmic speckle.
        ctx.fillStyle = U.hsla(hue - 20, 80, 72, f.weight * 0.3);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(rot) * r * 0.15, cy + Math.sin(rot * 1.3) * r * 0.15, r * 0.22, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  });

  /* ---------------------------------------------------------------- waves */
  /* Light as a wave, at the one magnification where its wavelength is the
     size of the view. Rings while the view is a few wavelengths across; a
     plane wave once the wavelength dwarfs the frame. */
  QM.layers.register('waves', {
    draw: function (ctx, f) {
      var field = f.field, view = f.view;
      // Each source is a full-frame gradient fill. Two give real interference;
      // on a device that cannot afford both, one honest wave beats a stutter.
      var sources = field.stats.sources.slice(0, view.quality < 0.6 ? 1 : 2);
      if (!sources.length) return;
      var diag = Math.sqrt(view.w * view.w + view.h * view.h);
      var planeDrawn = false;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (var i = 0; i < sources.length; i++) {
        var s = sources[i];
        var lambdaM = QM.phys.hueToWavelength(s.hue);
        var lambdaPx = lambdaM / view.mpp;
        var color = U.wavelengthColor(lambdaM, 1);
        var phase = (f.t * 0.6 + i * 0.31) % 1;
        var amplitude = 0.26 * (0.35 + s.lum);

        if (lambdaPx < 3) continue;          // finer than a pixel: nothing honest to draw

        if (lambdaPx > diag * 1.6) {
          // Magnified far below the wavelength: what is left is a plane wave
          // sweeping the frame. One is enough; a second full-frame gradient
          // costs more than every other layer and adds nothing visible.
          if (planeDrawn) continue;
          planeDrawn = true;
          var ang = Math.atan2(0.5 - s.v, 0.5 - s.u);
          var gx = Math.cos(ang), gy = Math.sin(ang);
          var pg = ctx.createLinearGradient(
            view.w / 2 - gx * diag / 2, view.h / 2 - gy * diag / 2,
            view.w / 2 + gx * diag / 2, view.h / 2 + gy * diag / 2);
          for (var k = 0; k <= 12; k++) {
            var t = k / 12;
            var pamp = 0.5 + 0.5 * Math.cos((t * diag / lambdaPx - phase) * TAU);
            pg.addColorStop(t, fade(color, pamp * 0.1 * f.weight * s.lum));
          }
          ctx.fillStyle = pg;
          ctx.fillRect(0, 0, view.w, view.h);
          continue;
        }

        // Concentric intensity rather than drawn rings: the wave is a field
        // with a value everywhere, and two of them overlapping is what makes
        // an interference pattern instead of a stack of circles.
        var cx = s.u * view.w, cy = s.v * view.h;
        var maxR = Math.max(
          Math.hypot(cx, cy), Math.hypot(view.w - cx, cy),
          Math.hypot(cx, view.h - cy), Math.hypot(view.w - cx, view.h - cy));
        var stops = Math.min(96, Math.max(6, Math.ceil(4 * maxR / lambdaPx)));
        var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
        for (var n = 0; n <= stops; n++) {
          var tt = n / stops;
          var r = tt * maxR;
          var amp = 0.5 + 0.5 * Math.cos((r / lambdaPx - phase) * TAU);
          var falloff = 1 / (1 + r / (diag * 0.45));
          rg.addColorStop(tt, fade(color, amp * falloff * amplitude * f.weight));
        }
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, view.w, view.h);
      }
      ctx.restore();
    }
  });

  /* ------------------------------------------------------------ molecules */
  /* A lattice laid over the scene: sites appear where there is matter to
     build from, and each site's element is read from that pixel's colour.
     Bond lengths and thermal amplitudes are drawn to the current scale. */
  QM.layers.register('molecules', {
    draw: function (ctx, f) {
      var field = f.field, view = f.view;
      var bondM = 1.45e-10;                       // typical covalent bond
      var bondPx = Math.max(13, bondM / view.mpp);
      if (bondPx > Math.max(view.w, view.h) * 1.4) return;

      var cols = Math.ceil(view.w / bondPx) + 2;
      var rows = Math.ceil(view.h / (bondPx * 0.866)) + 2;

      // Bond length is drawn at true scale, so a wide view means a lot of
      // atoms. Rather than stretch the lattice, the aperture closes down:
      // the same instrument, a narrower field, which is what happens on a
      // real one. The budget follows the measured frame rate.
      var budget = Math.round(1200 * Math.pow(U.clamp(view.quality, 0.2, 1), 1.6));
      var total = cols * rows;
      var aperture = total > budget ? Math.sqrt(budget / total) : 1;

      // Thermal displacement: sqrt(kT/k) for a stiff bond, ~5 pm at 290 K.
      var T = C.T0 * (1 + field.stats.meanDelta * 9);
      var jitterPx = U.clamp((5e-12 * Math.sqrt(T / C.T0)) / view.mpp, 0, bondPx * 0.22);
      var sites = [];
      var rnd = U.mulberry32(0xb0d5);

      for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
          var ox = (row % 2) * bondPx * 0.5;
          var x = col * bondPx + ox - bondPx;
          var y = row * bondPx * 0.866 - bondPx;
          var u = x / view.w, v = y / view.h;
          var lum = field.sample('lum', u, v);
          var idx = row * cols + col;
          if (aperture < 1) {
            var rx = (x / view.w - 0.5) * 2, ry = (y / view.h - 0.5) * 2;
            var rad = Math.sqrt(rx * rx + ry * ry) / (aperture * 1.42);
            if (rad > 1) { sites.push(null); continue; }
            lum *= U.clamp((1 - rad) * 4, 0, 1);      // soft edge to the aperture
          }
          if (lum < 0.055) { sites.push(null); continue; }
          var hue = field.nearest('hue', u, v);
          var sat = field.sample('sat', u, v);
          var el = U.elementFor(hue, sat, lum);
          var ph = (idx * 2.399) % TAU;
          sites.push({
            x: x + Math.sin(f.t * 5.2 + ph) * jitterPx,
            y: y + Math.cos(f.t * 4.3 + ph * 1.7) * jitterPx,
            el: el, lum: lum
          });
        }
      }

      ctx.save();
      ctx.lineCap = 'round';

      // Bonds and atoms are batched into a handful of paths: a thousand
      // separate stroke calls costs more than everything else on screen.
      var BUCKETS = 4;
      var bondPaths = [];
      for (var q = 0; q < BUCKETS; q++) bondPaths.push(null);

      for (var r2 = 0; r2 < rows; r2++) {
        for (var c2 = 0; c2 < cols; c2++) {
          var a = sites[r2 * cols + c2];
          if (!a) continue;
          var neighbours = [
            sites[r2 * cols + c2 + 1],
            r2 + 1 < rows ? sites[(r2 + 1) * cols + c2] : null,
            r2 + 1 < rows ? sites[(r2 + 1) * cols + c2 + ((r2 % 2) ? 1 : -1)] : null
          ];
          for (var k = 0; k < neighbours.length; k++) {
            var b = neighbours[k];
            if (!b) continue;
            var strength = Math.min(a.lum + b.lum, 1);
            var bucket = Math.min(BUCKETS - 1, Math.floor(strength * BUCKETS));
            var pathB = bondPaths[bucket] || (bondPaths[bucket] = new Path2D());
            pathB.moveTo(a.x, a.y);
            pathB.lineTo(b.x, b.y);
          }
        }
      }

      ctx.lineWidth = Math.max(1, Math.min(bondPx * 0.09, view.dpr * 2.5));
      for (var q2 = 0; q2 < BUCKETS; q2++) {
        if (!bondPaths[q2]) continue;
        var bondAlpha = f.weight * 0.30 * ((q2 + 0.5) / BUCKETS);
        ctx.strokeStyle = 'rgba(190,220,255,' + bondAlpha.toFixed(3) + ')';
        ctx.stroke(bondPaths[q2]);
      }

      // Once the orbital layer takes over there is no sphere to draw: an atom
      // is not a ball with a surface, and the two readings should not overlap.
      var solidity = 1 - U.clamp((f.weights && f.weights.orbitals) || 0, 0, 1);
      var atomR = Math.max(2, Math.min(bondPx * 0.3, 42));
      var atomPaths = {};
      if (solidity < 0.02) { ctx.restore(); return; }
      for (var i = 0; i < sites.length; i++) {
        var s2 = sites[i];
        if (!s2) continue;
        var rr = atomR * (0.55 + s2.el.radius / 1.1e-10 * 0.45);
        var ab = Math.min(BUCKETS - 1, Math.floor(s2.lum * BUCKETS));
        var key = s2.el.sym + ab;
        var entry = atomPaths[key] || (atomPaths[key] = { path: new Path2D(), color: s2.el.color, a: ab });
        entry.path.moveTo(s2.x + rr, s2.y);
        entry.path.arc(s2.x, s2.y, rr, 0, TAU);
      }
      for (var key2 in atomPaths) {
        if (!atomPaths.hasOwnProperty(key2)) continue;
        var e2 = atomPaths[key2];
        ctx.globalAlpha = f.weight * solidity * (0.45 + ((e2.a + 0.5) / BUCKETS) * 0.55);
        ctx.fillStyle = e2.color;
        ctx.fill(e2.path);
      }

      // Symbols only once there is room to read them.
      if (atomR > 16) {
        ctx.globalAlpha = f.weight * solidity * 0.85;
        ctx.fillStyle = 'rgba(8,12,20,0.85)';
        ctx.font = (atomR * 0.9).toFixed(0) + 'px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (var j = 0; j < sites.length; j++) {
          var s3 = sites[j];
          if (!s3) continue;
          ctx.fillText(s3.el.sym, s3.x, s3.y);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  });
})(window.QM = window.QM || {});
