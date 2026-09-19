/*
 * Layers below the chemical scale: electron probability, the nucleus, colour
 * confinement, and the vacuum itself. From here down nothing has a surface,
 * so nothing is drawn with one.
 */
(function (QM) {
  'use strict';

  var U = QM.util, C = QM.C, phys = QM.phys;
  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------- orbitals */
  /*
   * Electron position samples drawn from |psi|^2 for the element's outermost
   * subshell. Radial distributions are the hydrogenic ones -- Gamma(3, a0/2)
   * for 1s, Gamma(5, a0) for 2p, Gamma(7, 3a0/2) for 3d -- scaled by the
   * Slater effective charge. Each dot is one possible outcome of measuring
   * where the electron is, not a place the electron sits.
   */
  var SHELL = {
    s: { shape: 3, scale: 0.5 },
    p: { shape: 5, scale: 1.0 },
    d: { shape: 7, scale: 1.5 }
  };

  function sampleRadius(rnd, shape, scale) {
    // Gamma(k, theta) for integer k is the sum of k exponentials.
    var prod = 1;
    for (var i = 0; i < shape; i++) prod *= Math.max(rnd(), 1e-9);
    return -scale * Math.log(prod);
  }

  function sampleDirection(rnd, kind) {
    for (var tries = 0; tries < 24; tries++) {
      var z = rnd() * 2 - 1;
      var phi = rnd() * TAU;
      var s = Math.sqrt(1 - z * z);
      var x = s * Math.cos(phi), y = s * Math.sin(phi);
      if (kind === 's') return [x, y, z];
      if (kind === 'p') {                       // |Y10|^2 proportional to cos^2
        if (rnd() < z * z) return [x, y, z];
      } else {                                  // |Y20|^2 proportional to (3cos^2-1)^2
        var w = 3 * z * z - 1;
        if (rnd() < (w * w) / 4) return [x, y, z];
      }
    }
    return [0, 0, 1];
  }

  /*
   * The density itself is baked once into a sprite by splatting tens of
   * thousands of samples from |psi|^2; drawing it is then one image per atom.
   * A handful of live samples are splashed on top each frame so the cloud
   * still reads as something being measured rather than a texture.
   */
  var QUAD_PX = 96;                       // one quadrant of the sprite
  var SPRITE_PX = QUAD_PX * 2;

  /*
   * Both p and d densities are symmetric about the projection axes, and s is
   * symmetric about everything, so samples are accumulated into a single
   * quadrant and mirrored out. That is four times the statistics for the same
   * work, which is what makes the cloud smooth enough to tone-map.
   */
  function buildOrbitalSprite(kind, extent, samples) {
    var sh = SHELL[kind];
    var acc = new Float32Array(QUAD_PX * QUAD_PX);
    var rnd = U.mulberry32(0x0b17a1 ^ kind.charCodeAt(0));
    var scale = QUAD_PX / extent;

    for (var i = 0; i < samples; i++) {
      var r = sampleRadius(rnd, sh.shape, sh.scale);
      if (r > extent) continue;
      var d = sampleDirection(rnd, kind);
      // Orthographic projection, quantisation axis vertical in frame.
      var xi = (Math.abs(d[0]) * r * scale) | 0;
      var yi = (Math.abs(d[2]) * r * scale) | 0;
      if (xi >= QUAD_PX || yi >= QUAD_PX) continue;
      acc[yi * QUAD_PX + xi]++;
    }

    // Normalise against a high percentile rather than the maximum: one lucky
    // pixel should not set the exposure for the whole cloud.
    var lit = [];
    for (var j = 0; j < acc.length; j++) if (acc[j] > 0) lit.push(acc[j]);
    lit.sort(function (a, b) { return a - b; });
    var norm = lit.length ? lit[Math.min(lit.length - 1, Math.floor(lit.length * 0.995))] : 1;
    if (norm <= 0) norm = 1;

    var cv = document.createElement('canvas');
    cv.width = cv.height = SPRITE_PX;
    var c2 = cv.getContext('2d');
    var img = c2.createImageData(SPRITE_PX, SPRITE_PX);
    var data = img.data;

    for (var qy = 0; qy < QUAD_PX; qy++) {
      for (var qx = 0; qx < QUAD_PX; qx++) {
        var v = acc[qy * QUAD_PX + qx] / norm;
        if (v <= 0) continue;
        // A compressive curve: the core is orders of magnitude denser than
        // the tail, and a linear map would show only a dot.
        var t = Math.pow(v > 1 ? 1 : v, 0.85);
        var alpha = Math.min(255, t * 250);
        if (alpha < 3) continue;
        var r8 = 110 + 130 * t, g8 = 180 + 65 * t;
        for (var m = 0; m < 4; m++) {
          var px = (m & 1) ? QUAD_PX - 1 - qx : QUAD_PX + qx;
          var py = (m & 2) ? QUAD_PX - 1 - qy : QUAD_PX + qy;
          var k = (py * SPRITE_PX + px) * 4;
          data[k] = r8;
          data[k + 1] = g8;
          data[k + 2] = 255;
          data[k + 3] = alpha;
        }
      }
    }
    c2.putImageData(img, 0, 0);

    // One soft pass so the sample grid does not read as texture.
    var out = document.createElement('canvas');
    out.width = out.height = SPRITE_PX;
    var oc = out.getContext('2d');
    if (typeof oc.filter === 'string') oc.filter = 'blur(1.1px)';
    oc.drawImage(cv, 0, 0);
    oc.filter = 'none';
    return { canvas: out, extent: extent };
  }

  QM.layers.register('orbitals', {
    cloud: { s: null, p: null, d: null },
    sprites: null,
    cursor: 0,
    reset: function (view) {
      var n = Math.round(U.clamp(view.w * view.h / 3400, 140, 700) * view.quality);
      var rnd = U.mulberry32(0x0b17a1);
      var self = this;
      ['s', 'p', 'd'].forEach(function (kind) {
        var sh = SHELL[kind];
        var pts = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) {
          var r = sampleRadius(rnd, sh.shape, sh.scale);
          var d = sampleDirection(rnd, kind);
          pts[i * 3] = d[0] * r;
          pts[i * 3 + 1] = d[1] * r;
          pts[i * 3 + 2] = d[2] * r;
        }
        self.cloud[kind] = pts;
      });
      this.count = n;
      if (!this.sprites) {
        // Extents hold ~97% of the radial probability; past that the
        // sprite would be mostly empty pixels being blended for nothing.
        this.sprites = {
          s: buildOrbitalSprite('s', 3.5, 260000),
          p: buildOrbitalSprite('p', 9, 320000),
          d: buildOrbitalSprite('d', 16, 380000)
        };
      }
    },
    /* Replace a slice of the live samples each frame: the sparkle is the
       cloud being re-measured, not the cloud spinning. */
    refresh: function (kind, budget) {
      var pts = this.cloud[kind];
      if (!pts) return;
      var sh = SHELL[kind];
      var n = this.count;
      for (var k = 0; k < budget; k++) {
        var i = (this.cursor + k) % n;
        var r = sampleRadius(Math.random, sh.shape, sh.scale);
        var d = sampleDirection(Math.random, kind);
        pts[i * 3] = d[0] * r;
        pts[i * 3 + 1] = d[1] * r;
        pts[i * 3 + 2] = d[2] * r;
      }
    },
    draw: function (ctx, f) {
      if (!this.cloud.s || !this.sprites) return;
      var field = f.field, view = f.view;
      var bondPx = Math.max(36, 1.45e-10 / view.mpp);
      var cols = Math.min(14, Math.ceil(view.w / bondPx) + 2);
      var rows = Math.min(14, Math.ceil(view.h / (bondPx * 0.866)) + 2);
      var a0px = C.a0 / view.mpp;
      if (a0px < 0.6) return;

      this.refresh('s', 18);
      this.refresh('p', 18);
      this.refresh('d', 18);
      this.cursor = (this.cursor + 18) % this.count;

      var atomsInFrame = Math.max(1, cols * rows);
      var dots = Math.round(U.clamp(3600 * view.quality / atomsInFrame, 24, this.count));
      var dotR = U.clamp(a0px * 0.03, 0.7, 2.2) * view.dpr;
      var diag = Math.sqrt(view.w * view.w + view.h * view.h);

      // Clouds overlap and are mostly soft gradient, so they are composited
      // at half resolution and blown up once. It is the difference between
      // one screenful of blending per frame and thirty.
      var bw = Math.max(2, Math.round(view.w * 0.5));
      var bh = Math.max(2, Math.round(view.h * 0.5));
      if (!this.buf) {
        this.buf = document.createElement('canvas');
        this.bufCtx = this.buf.getContext('2d');
      }
      if (this.buf.width !== bw || this.buf.height !== bh) {
        this.buf.width = bw;
        this.buf.height = bh;
      }
      var bc = this.bufCtx;
      bc.clearRect(0, 0, bw, bh);
      bc.globalCompositeOperation = 'lighter';
      var usedBuf = false;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var washed = false;

      for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
          var x = col * bondPx + (row % 2) * bondPx * 0.5 - bondPx;
          var y = row * bondPx * 0.866 - bondPx;
          var u = x / view.w, v = y / view.h;
          var lum = field.sample('lum', u, v);
          if (lum < 0.05) continue;
          var el = U.elementFor(field.nearest('hue', u, v), field.sample('sat', u, v), lum);
          var sprite = this.sprites[el.orbital];
          var scale = a0px / el.zeff;                 // one Bohr radius, screened
          if (scale < 0.35) continue;
          var size = sprite.extent * 2 * scale;
          if (size < 6 || x < -size || x > view.w + size || y < -size || y > view.h + size) continue;

          // No preferred axis in the lab frame: the quantisation axis drifts.
          var ang = f.t * 0.16 + col * 0.9 + row * 1.7;
          if (size > diag * 1.5) {
            // Magnified past the cloud itself: the view is inside it, where
            // the density is flat. A single wash is the honest picture.
            if (!washed) {
              washed = true;
              ctx.globalAlpha = U.clamp(0.05 + lum * 0.07, 0, 0.14) * f.weight;
              ctx.fillStyle = 'rgba(120,190,255,1)';
              ctx.fillRect(0, 0, view.w, view.h);
            }
          } else {
            usedBuf = true;
            bc.globalAlpha = U.clamp(0.35 + lum * 0.6, 0, 1);
            bc.translate(x * 0.5, y * 0.5);
            bc.rotate(ang);
            bc.drawImage(sprite.canvas, -size * 0.25, -size * 0.25, size * 0.5, size * 0.5);
            bc.rotate(-ang);
            bc.translate(-x * 0.5, -y * 0.5);
          }

          // Live samples: each speck is one possible measurement.
          var pts = this.cloud[el.orbital];
          var ca = Math.cos(ang), sa = Math.sin(ang);
          ctx.globalAlpha = U.clamp(0.20 + lum * 0.3, 0, 0.6) * f.weight;
          ctx.fillStyle = '#eaf6ff';
          for (var i = 0; i < dots; i++) {
            var qx = pts[i * 3], qz = pts[i * 3 + 2];
            var sx = x + (qx * ca - qz * sa) * scale;
            var sy = y + (qx * sa + qz * ca) * scale;
            if (sx < -4 || sx > view.w + 4 || sy < -4 || sy > view.h + 4) continue;
            ctx.fillRect(sx, sy, dotR, dotR);
          }

          // The nucleus: five orders of magnitude too small to draw here.
          var nucleus = U.glowSprite('rgba(255,236,190,' + (f.weight * 0.9).toFixed(3) + ')', a0px * 0.12 + 5);
          ctx.globalAlpha = f.weight;
          ctx.drawImage(nucleus, x - nucleus.width / 2, y - nucleus.height / 2);

          if (bondPx > 110) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = f.weight * 0.55;
            ctx.fillStyle = '#cfe0ff';
            ctx.font = '500 ' + Math.min(14, bondPx * 0.05).toFixed(0) + 'px ui-monospace, Menlo, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(el.sym + ' ' + el.shell + el.orbital, x, y + Math.min(size * 0.26, bondPx * 0.42));
            ctx.globalCompositeOperation = 'lighter';
          }
        }
      }
      if (usedBuf) {
        ctx.globalAlpha = f.weight;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'low';
        ctx.drawImage(this.buf, 0, 0, bw, bh, 0, 0, view.w, view.h);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  });

  /* -------------------------------------------------------------- nucleus */
  /*
   * One nucleus, centred on the reticle. A nucleons packed into a sphere of
   * radius 1.2 fm * A^(1/3) -- the whole of the atom's mass inside a
   * hundred-thousandth of its width.
   */
  QM.layers.register('nucleus', {
    pack: null,
    ensurePack: function (n) {
      if (this.pack && this.pack.length >= n * 3) return;
      // Uniform in the ball: a random direction at radius cbrt(u). Nuclear
      // density is close to constant out to the surface, so this is the right
      // distribution rather than a shell model.
      var rnd = U.mulberry32(0x9ac1e05);
      var count = Math.max(n, 64);
      var pts = new Float32Array(count * 3);
      for (var i = 0; i < count; i++) {
        var z = rnd() * 2 - 1;
        var phi = rnd() * TAU;
        var s = Math.sqrt(1 - z * z);
        var r = Math.cbrt(rnd()) * 0.88;
        pts[i * 3] = s * Math.cos(phi) * r;
        pts[i * 3 + 1] = s * Math.sin(phi) * r;
        pts[i * 3 + 2] = z * r;
      }
      // Re-centre on the centroid: with a dozen nucleons the raw draw sits
      // visibly off to one side of the nucleus it is supposed to fill.
      for (var axis = 0; axis < 3; axis++) {
        var sum = 0;
        for (var j = 0; j < count; j++) sum += pts[j * 3 + axis];
        var mean = sum / count;
        for (var k = 0; k < count; k++) pts[k * 3 + axis] -= mean;
      }
      this.pack = pts;
    },
    draw: function (ctx, f) {
      var field = f.field, view = f.view;
      var el = f.element;
      this.ensurePack(el.A);

      var R = 1.2e-15 * Math.cbrt(el.A);
      var Rpx = R / view.mpp;
      var nucleonPx = C.rProton / view.mpp;
      if (nucleonPx < 0.8) return;

      var cx = view.w / 2, cy = view.h / 2;
      var agit = field.stats.meanDelta;
      var wobble = nucleonPx * (0.06 + agit * 1.4);
      var drawn = [];
      // Once a single nucleon is most of the frame, the view has gone inside
      // one: filling them in would just flood the screen, so they become
      // outlines and the quark layer takes over the interior.
      var inside = nucleonPx > Math.min(view.w, view.h) * 0.3;

      ctx.save();
      // The bag: not a wall, just where the density runs out.
      ctx.globalAlpha = f.weight * 0.35;
      ctx.strokeStyle = 'rgba(120,200,230,0.5)';
      ctx.lineWidth = Math.max(1, view.dpr);
      if (Rpx < Math.max(view.w, view.h)) {
        ctx.setLineDash([6 * view.dpr, 8 * view.dpr]);
        ctx.beginPath();
        ctx.arc(cx, cy, Rpx, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;

      for (var i = 0; i < el.A; i++) {
        var px = this.pack[i * 3], py = this.pack[i * 3 + 1], pz = this.pack[i * 3 + 2];
        var ang = f.t * 0.15;
        var rx = px * Math.cos(ang) - pz * Math.sin(ang);
        var rz = px * Math.sin(ang) + pz * Math.cos(ang);
        var x = cx + rx * Rpx + Math.sin(f.t * 3.1 + i) * wobble;
        var y = cy + py * Rpx + Math.cos(f.t * 2.7 + i * 1.7) * wobble;
        var depth = 0.55 + 0.45 * (rz + 1) / 2;
        var proton = i < el.Z;
        drawn.push({ x: x, y: y, d: depth, p: proton });
      }
      drawn.sort(function (a, b) { return a.d - b.d; });

      // Residual strong force: pion exchange flickering between close pairs.
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = Math.max(1, view.dpr * 0.9);
      for (var a = 0; a < drawn.length && !inside; a++) {
        for (var b = a + 1; b < drawn.length; b++) {
          var dx = drawn[a].x - drawn[b].x, dy = drawn[a].y - drawn[b].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > nucleonPx * 2.4) continue;
          var flick = Math.sin(f.t * 9 + a * 2.3 + b * 1.7);
          if (flick < 0.55) continue;
          ctx.strokeStyle = 'rgba(160,255,220,' + (f.weight * 0.35 * (flick - 0.55) / 0.45).toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(drawn[a].x, drawn[a].y);
          ctx.lineTo(drawn[b].x, drawn[b].y);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      for (var k = 0; k < drawn.length; k++) {
        var n = drawn[k];
        var base = n.p ? [232, 92, 74] : [128, 150, 178];
        var radius = nucleonPx * n.d;
        if (radius > view.w * 3) continue;
        if (inside) {
          ctx.globalAlpha = f.weight * 0.22 * n.d;
          ctx.strokeStyle = 'rgb(' + base.join(',') + ')';
          ctx.lineWidth = Math.max(1, view.dpr * 1.5);
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, TAU);
          ctx.stroke();
          continue;
        }
        ctx.globalAlpha = f.weight * (0.3 + n.d * 0.5);
        var g = ctx.createRadialGradient(
          n.x - nucleonPx * 0.3, n.y - nucleonPx * 0.3, nucleonPx * 0.1,
          n.x, n.y, nucleonPx);
        g.addColorStop(0, 'rgb(' + base.map(function (c) { return Math.min(255, c + 70); }).join(',') + ')');
        g.addColorStop(1, 'rgb(' + base.join(',') + ')');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  });

  /* --------------------------------------------------------------- quarks */
  /*
   * Inside one nucleon. The three valence quarks carry colour charge, and the
   * camera pixel's red, green and blue channels are used literally: they set
   * the relative weight of the three colour charges in this nucleon's mix.
   * Gluon flux tubes exchange colour continuously; sea pairs come and go.
   */
  QM.layers.register('quarks', {
    sea: [],
    reset: function (view) {
      var n = Math.round(U.clamp(view.w / 34, 8, 30) * view.quality);
      var rnd = U.mulberry32(0x5ea9);
      this.sea = [];
      for (var i = 0; i < n; i++) {
        this.sea.push({ born: -rnd() * 2, life: 0.25 + rnd() * 0.6, a: rnd() * TAU, r: rnd() });
      }
    },
    draw: function (ctx, f) {
      var field = f.field, view = f.view;
      var Rpx = C.rProton / view.mpp;
      var diag = Math.sqrt(view.w * view.w + view.h * view.h);
      // Below the nucleon there is no nucleon left to draw, and a quark has
      // no measured size at all -- the vacuum layer owns the view from here.
      if (Rpx < 14 || Rpx > diag * 2.2) return;
      var cx = view.w / 2, cy = view.h / 2;

      var i0 = field.indexAt(0.5, 0.5);
      var mix = [field.r[i0], field.g[i0], field.b[i0]];
      var total = mix[0] + mix[1] + mix[2] || 1;
      var proton = mix[0] >= mix[2];
      var flavours = proton ? ['u', 'u', 'd'] : ['u', 'd', 'd'];
      var COLORS = [[255, 74, 74], [74, 235, 120], [96, 150, 255]];

      // Colour charge is exchanged, never held: the assignment cycles.
      var cyc = f.t * 0.55;
      var shift = Math.floor(cyc) % 3;
      var frac = QM.scales.smoothstep((cyc % 1 - 0.55) / 0.45);

      var q = [];
      for (var i = 0; i < 3; i++) {
        var ang = f.t * 0.6 + i * TAU / 3;
        var wob = 0.10 * Math.sin(f.t * 2.3 + i * 2.1);
        var rr = Rpx * (0.42 + wob);
        var ci = (i + shift) % 3;
        var cj = (i + shift + 1) % 3;
        var col = [0, 1, 2].map(function (ch) {
          return Math.round(COLORS[ci][ch] * (1 - frac) + COLORS[cj][ch] * frac);
        });
        q.push({
          x: cx + Math.cos(ang) * rr,
          y: cy + Math.sin(ang) * rr,
          col: col,
          flavour: flavours[i],
          weight: 0.45 + 0.55 * (mix[ci] / total) * 3
        });
      }

      ctx.save();
      // The bag boundary. Quarks are never found outside it: pull one out and
      // the tube's energy makes a new pair instead.
      var bag = ctx.createRadialGradient(cx, cy, Rpx * 0.15, cx, cy, Rpx);
      bag.addColorStop(0, 'rgba(90,150,255,' + (f.weight * 0.10).toFixed(3) + ')');
      bag.addColorStop(0.75, 'rgba(60,110,200,' + (f.weight * 0.05).toFixed(3) + ')');
      bag.addColorStop(1, 'rgba(30,60,140,0)');
      ctx.fillStyle = bag;
      ctx.beginPath();
      ctx.arc(cx, cy, Rpx, 0, TAU);
      ctx.fill();

      // Sea quarks: virtual pairs inside the nucleon.
      ctx.globalCompositeOperation = 'lighter';
      for (var s = 0; s < this.sea.length; s++) {
        var sq = this.sea[s];
        var age = f.t - sq.born;
        if (age > sq.life) {
          sq.born = f.t; sq.life = 0.25 + Math.random() * 0.6;
          sq.a = Math.random() * TAU; sq.r = Math.random();
        }
        var env = Math.sin(Math.PI * U.clamp(age / sq.life, 0, 1));
        var srad = Rpx * 0.85 * Math.sqrt(sq.r);
        var sx = cx + Math.cos(sq.a) * srad, sy = cy + Math.sin(sq.a) * srad;
        var sep = Rpx * 0.05 * env;
        ctx.fillStyle = 'rgba(200,225,255,' + (f.weight * 0.45 * env).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sx - sep, sy, Rpx * 0.018, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + sep, sy, Rpx * 0.018, 0, TAU); ctx.fill();
      }

      // Gluon flux tubes.
      ctx.lineWidth = Math.max(1.5, Rpx * 0.009);
      for (var a2 = 0; a2 < 3; a2++) {
        var b2 = (a2 + 1) % 3;
        var qa = q[a2], qb = q[b2];
        var mx = (qa.x + qb.x) / 2, my = (qa.y + qb.y) / 2;
        var bow = Math.sin(f.t * 3.4 + a2 * 2.1) * Rpx * 0.16;
        var nx = -(qb.y - qa.y), ny = qb.x - qa.x;
        var nl = Math.sqrt(nx * nx + ny * ny) || 1;
        var grad = ctx.createLinearGradient(qa.x, qa.y, qb.x, qb.y);
        grad.addColorStop(0, 'rgba(' + qa.col.join(',') + ',' + (f.weight * 0.5).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(' + qb.col.join(',') + ',' + (f.weight * 0.5).toFixed(3) + ')');
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(qa.x, qa.y);
        ctx.quadraticCurveTo(mx + nx / nl * bow, my + ny / nl * bow, qb.x, qb.y);
        ctx.stroke();
      }

      for (var k = 0; k < 3; k++) {
        var qq = q[k];
        var r = Rpx * 0.07 * U.clamp(qq.weight, 0.5, 1.6);
        var g2 = ctx.createRadialGradient(qq.x, qq.y, 0, qq.x, qq.y, r * 1.9);
        g2.addColorStop(0, 'rgba(' + qq.col.join(',') + ',' + f.weight.toFixed(3) + ')');
        g2.addColorStop(0.3, 'rgba(' + qq.col.join(',') + ',' + (f.weight * 0.55).toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(' + qq.col.join(',') + ',0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(qq.x, qq.y, r * 1.9, 0, TAU);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      if (Rpx > 90) {
        ctx.globalAlpha = f.weight;
        ctx.fillStyle = '#f2f7ff';
        ctx.font = '600 ' + U.clamp(Rpx * 0.035, 12, 26).toFixed(0) + 'px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        for (var m = 0; m < 3; m++) {
          ctx.fillText(q[m].flavour, q[m].x, q[m].y - Rpx * 0.14);
        }
        ctx.fillText(proton ? 'proton  uud' : 'neutron  udd',
          cx, Math.min(cy + Rpx * 1.08, view.h * 0.76));
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  });

  /* --------------------------------------------------------------- vacuum */
  var MS_TABLE = [
    [], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]],
    [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], []
  ];

  /* Iso-luminance contours: the scene redrawn as the energy landscape the
     vacuum is sitting in. */
  function contour(ctx, field, view, level, style, width) {
    var w = field.cols, h = field.rows, L = field.lum;
    var sx = view.w / (w - 1), sy = view.h / (h - 1);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (var y = 0; y < h - 1; y++) {
      for (var x = 0; x < w - 1; x++) {
        var v00 = L[y * w + x], v10 = L[y * w + x + 1];
        var v11 = L[(y + 1) * w + x + 1], v01 = L[(y + 1) * w + x];
        var idx = (v00 > level ? 1 : 0) | (v10 > level ? 2 : 0) |
                  (v11 > level ? 4 : 0) | (v01 > level ? 8 : 0);
        var segs = MS_TABLE[idx];
        for (var s = 0; s < segs.length; s++) {
          var p0 = edgePoint(segs[s][0], x, y, v00, v10, v11, v01, level, sx, sy);
          var p1 = edgePoint(segs[s][1], x, y, v00, v10, v11, v01, level, sx, sy);
          ctx.moveTo(p0[0], p0[1]);
          ctx.lineTo(p1[0], p1[1]);
        }
      }
    }
    ctx.stroke();
  }

  function edgePoint(edge, x, y, v00, v10, v11, v01, level, sx, sy) {
    var t;
    switch (edge) {
      case 0: t = (level - v00) / (v10 - v00 || 1e-9); return [(x + t) * sx, y * sy];
      case 1: t = (level - v10) / (v11 - v10 || 1e-9); return [(x + 1) * sx, (y + t) * sy];
      case 2: t = (level - v01) / (v11 - v01 || 1e-9); return [(x + t) * sx, (y + 1) * sy];
      default: t = (level - v00) / (v01 - v00 || 1e-9); return [x * sx, (y + t) * sy];
    }
  }

  /*
   * Nothing, drawn honestly: fields at their ground state, borrowing energy
   * against the uncertainty principle and repaying it. Each pair's lifetime
   * is hbar/2dE for the energy it borrowed, mapped to the display clock; the
   * borrowing rate is highest where the scene carries the most field energy.
   */
  QM.layers.register('vacuum', {
    pairs: [],
    reset: function (view) {
      var n = Math.round(U.clamp(view.w * view.h / 3600, 60, 400) * view.quality);
      var rnd = U.mulberry32(0xfa0a);
      this.pairs = [];
      for (var i = 0; i < n; i++) {
        this.pairs.push({ u: rnd(), v: rnd(), born: -rnd() * 1.5, life: 0.3, ang: rnd() * TAU, e: 1 });
      }
    },
    draw: function (ctx, f) {
      var field = f.field, view = f.view;
      ctx.save();

      // The scene as a potential landscape.
      ctx.globalAlpha = f.weight * 0.55;
      var lo = field.stats.minLum, hi = field.stats.maxLum;
      if (hi - lo < 1e-4) { lo = 0; hi = 1; }
      for (var l = 0; l < 6; l++) {
        var level = lo + (hi - lo) * (l + 0.5) / 6;
        contour(ctx, field, view, level,
          'rgba(110,190,255,' + (0.09 + l * 0.045).toFixed(3) + ')',
          Math.max(1, view.dpr * 0.9));
      }
      ctx.globalAlpha = 1;

      ctx.globalCompositeOperation = 'lighter';
      var scale = Math.min(view.w, view.h);
      for (var i = 0; i < this.pairs.length; i++) {
        var p = this.pairs[i];
        var age = f.t - p.born;
        if (age > p.life) {
          // Respawn where the field energy is: more energy, more fluctuation.
          var u = Math.random(), v = Math.random();
          var lum = field.sample('lum', u, v);
          // The vacuum fluctuates everywhere; it just fluctuates harder where
          // the scene carries field energy.
          if (0.3 + lum * 0.8 < Math.random()) continue;
          p.u = u; p.v = v;
          p.born = f.t;
          p.ang = Math.random() * TAU;
          // Borrowed energy, in units of the local field energy density.
          p.e = 0.3 + Math.random() * 0.7 + lum;
          p.life = 0.18 + 0.5 / (p.e * 2);       // dt ~ hbar / 2 dE
          continue;
        }
        var tt = U.clamp(age / p.life, 0, 1);
        var env = Math.sin(Math.PI * tt);
        var x = p.u * view.w, y = p.v * view.h;
        var sep = env * scale * 0.012 * p.e;
        var dx = Math.cos(p.ang) * sep, dy = Math.sin(p.ang) * sep;
        var a = f.weight * env * 0.8;
        var rad = Math.max(1.6, scale * 0.005) * view.dpr;

        ctx.fillStyle = 'rgba(255,150,180,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x + dx, y + dy, rad, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(150,215,255,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x - dx, y - dy, rad, 0, TAU); ctx.fill();

        // The loop closing: annihilation flash as the debt is repaid.
        if (tt > 0.88) {
          var flash = (tt - 0.88) / 0.12;
          ctx.strokeStyle = 'rgba(255,255,255,' + (f.weight * (1 - flash) * 0.5).toFixed(3) + ')';
          ctx.lineWidth = Math.max(1, view.dpr);
          ctx.beginPath();
          ctx.arc(x, y, sep * (1 + flash * 2.5), 0, TAU);
          ctx.stroke();
        } else if (tt > 0.15) {
          ctx.strokeStyle = 'rgba(180,200,255,' + (f.weight * env * 0.18).toFixed(3) + ')';
          ctx.lineWidth = Math.max(1, view.dpr * 0.7);
          ctx.beginPath();
          ctx.ellipse(x, y, sep * 1.25, sep * 0.7, p.ang, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  });
})(window.QM = window.QM || {});
