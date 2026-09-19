/*
 * The instrument.
 *
 * Holds the camera, the translated field, the magnification dial and the
 * render loop, and decides how much of the physical image survives at each
 * depth: at the top the world is untouched, at the bottom there is nothing
 * left of it but the fields it is made of.
 */
(function (QM) {
  'use strict';

  var U = QM.util, C = QM.C, scales = QM.scales;
  var CSS_PX_METRES = 0.0002646;   // 1 CSS pixel at the nominal 96 dpi

  var LAYER_NAMES = {
    fieldlines: 'Field lines',
    photons: 'Photons',
    cells: 'Cells',
    waves: 'Wavefronts',
    molecules: 'Molecules',
    orbitals: 'Orbitals',
    nucleus: 'Nucleus',
    quarks: 'Quarks',
    vacuum: 'Vacuum'
  };

  function App() {
    this.canvas = document.getElementById('stage');
    this.ctx = this.canvas.getContext('2d');
    this.video = document.getElementById('video');
    this.field = new QM.Field(64);
    this.hud = new QM.Hud(document.getElementById('readouts'));

    this.source = new QM.SyntheticSource();
    this.position = 0;
    this.target = 0;
    this.paused = false;
    this.quality = 1;
    this.disabled = {};
    this.probeUV = { u: 0.5, v: 0.5 };
    this.probeLocked = false;
    this.lastFrame = performance.now();
    this.fpsAvg = 60;
    this.view = { w: 1, h: 1, dpr: 1, fov: 1, mpp: 1, quality: 1 };

    // On a phone the readout would cover the thing it is describing, so it
    // starts folded away behind its own button.
    if (window.innerWidth <= 720) document.body.classList.add('panel-hidden');

    this.bindUI();
    this.resize();
    window.addEventListener('resize', this.resize.bind(this));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.resize.bind(this));
    }
  }

  /* -------------------------------------------------------------- startup */

  App.prototype.begin = function () {
    var self = this;
    var intro = document.getElementById('intro');
    var status = document.getElementById('intro-status');
    var hasCamera = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    function reveal(note) {
      intro.classList.add('hidden');
      document.body.classList.add('running');
      self.setSourceLabel(note);
      self.loop();
    }

    if (!hasCamera) {
      this.source = new QM.SyntheticSource();
      reveal('no camera API · simulated specimen');
      return;
    }

    status.textContent = 'requesting camera…';
    var cam = new QM.CameraSource(this.video);
    cam.open('environment').then(function () {
      self.source = cam;
      reveal(cam.label());
    }).catch(function (err) {
      self.source = new QM.SyntheticSource();
      reveal('camera unavailable (' + (err && err.name ? err.name : 'error') + ') · simulated specimen');
    });
  };

  App.prototype.setSourceLabel = function (text) {
    var el = document.getElementById('sourcelabel');
    if (el) el.textContent = text;
  };

  App.prototype.flipCamera = function () {
    var self = this;
    if (this.source.kind !== 'camera') return;
    var next = this.source.facing === 'user' ? 'environment' : 'user';
    this.source.open(next).then(function () {
      self.setSourceLabel(self.source.label());
    }).catch(function () {
      self.setSourceLabel('could not switch camera');
    });
  };

  /* --------------------------------------------------------------- layout */

  App.prototype.resize = function () {
    this.measureControls();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.view.w = w;
    this.view.h = h;
    this.view.dpr = dpr;
    this.view.cssWidth = rect.width;
    this.view.quality = this.quality;
    this.resetLayers();
  };

  /* The readout is positioned above the controls, which change height with
     the viewport, so the measurement has to come from the element itself. */
  App.prototype.measureControls = function () {
    var controls = document.getElementById('controls');
    if (!controls) return;
    var h = Math.round(controls.getBoundingClientRect().height);
    if (h > 0 && h !== this.controlsHeight) {
      this.controlsHeight = h;
      document.documentElement.style.setProperty('--controls-h', h + 'px');
    }
  };

  App.prototype.resetLayers = function () {
    for (var id in QM.layers.all) {
      if (!QM.layers.all.hasOwnProperty(id)) continue;
      var layer = QM.layers.all[id];
      if (layer.reset) layer.reset(this.view);
    }
  };

  /* ------------------------------------------------------------ the dial */

  App.prototype.setTarget = function (pos) {
    this.target = U.clamp(pos, 0, scales.maxPosition);
    var dial = document.getElementById('dial');
    if (dial && Math.abs(parseFloat(dial.value) - this.target) > 1e-3) {
      dial.value = this.target;
    }
  };

  App.prototype.nudge = function (delta) {
    this.setTarget(this.target + delta);
  };

  /* ------------------------------------------------------------------ UI */

  App.prototype.bindUI = function () {
    var self = this;

    document.getElementById('begin').addEventListener('click', function () {
      self.begin();
    });

    var dial = document.getElementById('dial');
    dial.min = 0;
    dial.max = scales.maxPosition;
    dial.step = 0.001;
    dial.value = 0;
    dial.addEventListener('input', function () {
      self.target = parseFloat(dial.value);
    });

    this.buildTicks();
    this.buildChips();
    this.measureControls();

    this.canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.nudge(e.deltaY * 0.0022);
    }, { passive: false });

    // Pinch to magnify, tap to move the probe.
    var pointers = {};
    var pinchStart = null;
    this.canvas.addEventListener('pointerdown', function (e) {
      self.canvas.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY, moved: false };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        pinchStart = { dist: pointerDistance(pointers, ids), pos: self.target };
      }
    });
    this.canvas.addEventListener('pointermove', function (e) {
      var p = pointers[e.pointerId];
      if (!p) return;
      if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 6) p.moved = true;
      p.x = e.clientX; p.y = e.clientY;
      var ids = Object.keys(pointers);
      if (ids.length === 2 && pinchStart) {
        var d = pointerDistance(pointers, ids);
        if (pinchStart.dist > 10 && d > 10) {
          // Each doubling of the pinch is a step down the ladder.
          self.setTarget(pinchStart.pos + Math.log(d / pinchStart.dist) / Math.LN2 * 1.1);
        }
      }
    });
    function release(e) {
      var p = pointers[e.pointerId];
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinchStart = null;
      if (p && !p.moved) self.probeAt(e.clientX, e.clientY);
    }
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; });

    document.getElementById('btn-flip').addEventListener('click', function () { self.flipCamera(); });
    document.getElementById('btn-pause').addEventListener('click', function () {
      self.paused = !self.paused;
      this.classList.toggle('on', self.paused);
      this.textContent = self.paused ? 'Resume' : 'Freeze';
    });
    document.getElementById('btn-shot').addEventListener('click', function () { self.snapshot(); });
    var panelButton = document.getElementById('btn-panel');
    panelButton.classList.toggle('on', !document.body.classList.contains('panel-hidden'));
    panelButton.addEventListener('click', function () {
      document.body.classList.toggle('panel-hidden');
      this.classList.toggle('on', !document.body.classList.contains('panel-hidden'));
      self.measureControls();
    });
    document.getElementById('btn-about').addEventListener('click', function () {
      document.getElementById('about').classList.toggle('hidden');
    });
    document.getElementById('about-close').addEventListener('click', function () {
      document.getElementById('about').classList.add('hidden');
    });

    window.addEventListener('keydown', function (e) {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      switch (e.key) {
        case '=': case '+': self.nudge(0.35); break;
        case '-': case '_': self.nudge(-0.35); break;
        case ' ': e.preventDefault(); document.getElementById('btn-pause').click(); break;
        case 'p': document.getElementById('btn-panel').click(); break;
        case 'f': self.flipCamera(); break;
        case 's': self.snapshot(); break;
        case 'r': self.probeLocked = false; self.probeUV = { u: 0.5, v: 0.5 }; break;
        case 'Escape': document.getElementById('about').classList.add('hidden'); break;
        default:
          if (e.key >= '1' && e.key <= '9') self.setTarget(parseInt(e.key, 10) - 1);
      }
    });
  };

  function pointerDistance(pointers, ids) {
    var a = pointers[ids[0]], b = pointers[ids[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  App.prototype.probeAt = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var u = (clientX - rect.left) / rect.width;
    var v = (clientY - rect.top) / rect.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    var atCentre = Math.abs(u - 0.5) < 0.04 && Math.abs(v - 0.5) < 0.04;
    if (this.probeLocked && atCentre) {
      this.probeLocked = false;
      this.probeUV = { u: 0.5, v: 0.5 };
    } else {
      this.probeUV = { u: u, v: v };
      this.probeLocked = true;
    }
  };

  App.prototype.buildTicks = function () {
    var holder = document.getElementById('dial-ticks');
    holder.innerHTML = '';
    var self = this;
    scales.REGIMES.forEach(function (regime, i) {
      var tick = document.createElement('button');
      tick.className = 'tick';
      tick.type = 'button';
      tick.textContent = regime.name;
      tick.title = regime.note;
      tick.style.left = (i / scales.maxPosition * 100) + '%';
      // The end labels would otherwise hang off the rail.
      if (i === 0) tick.style.transform = 'translateX(0)';
      else if (i === scales.maxPosition) tick.style.transform = 'translateX(-100%)';
      tick.addEventListener('click', function () { self.setTarget(i); });
      holder.appendChild(tick);
      regime.tickNode = tick;
    });
  };

  App.prototype.buildChips = function () {
    var holder = document.getElementById('layerchips');
    var self = this;
    holder.innerHTML = '';
    Object.keys(LAYER_NAMES).forEach(function (id) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip on';
      chip.textContent = LAYER_NAMES[id];
      chip.addEventListener('click', function () {
        self.disabled[id] = !self.disabled[id];
        chip.classList.toggle('on', !self.disabled[id]);
      });
      holder.appendChild(chip);
      self['chip_' + id] = chip;
    });
  };

  App.prototype.snapshot = function () {
    try {
      var url = this.canvas.toDataURL('image/png');
      var a = document.createElement('a');
      a.href = url;
      a.download = 'quantum-magnifier-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      this.setSourceLabel('snapshot blocked by the browser');
    }
  };

  /* --------------------------------------------------------------- frame */

  App.prototype.loop = function () {
    var self = this;
    function step(now) {
      self.frame(now);
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };

  App.prototype.frame = function (now) {
    var dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (dt > 0) this.fpsAvg = this.fpsAvg * 0.94 + (1 / dt) * 0.06;
    this.adaptQuality();

    // Ease toward the dial so a flick down the ladder reads as a descent.
    this.position += (this.target - this.position) * Math.min(1, dt * 7);

    var view = this.view;
    var state = scales.stateFromPosition(this.position);
    view.fov = state.fov;
    view.mpp = state.fov / view.w;

    // The scene is re-read at about 30 Hz. Pulling a video frame through a
    // canvas is the most expensive thing in the loop, and the overlay
    // animates on its own clock, so reading it every frame buys nothing.
    if (!this.paused && now - (this.lastFieldRead || 0) >= 32) {
      this.lastFieldRead = now;
      this.field.update(this.source, view.w / view.h);
    }

    var probe = this.field.probe(this.probeUV.u, this.probeUV.v, view.mpp);
    var element = U.elementFor(probe.hue, probe.sat, probe.lum);

    var ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    this.drawPassthrough(ctx, state);

    var weights = scales.layerWeights(state);
    var frame = {
      field: this.field,
      view: view,
      t: now / 1000,
      dt: this.paused ? 0 : dt,
      weight: 1,
      probe: probe,
      element: element,
      state: state,
      weights: weights
    };

    var order = ['fieldlines', 'waves', 'cells', 'molecules', 'orbitals', 'nucleus', 'quarks', 'vacuum', 'photons'];
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      var w = weights[id];
      if (!w || w < 0.012 || this.disabled[id]) continue;
      var layer = QM.layers.get(id);
      if (!layer) continue;
      frame.weight = w;
      ctx.save();
      try {
        layer.draw(ctx, frame);
      } catch (err) {
        // One bad layer should cost its own pass, not the rest of the frame.
        this.disabled[id] = true;
        if (this['chip_' + id]) this['chip_' + id].classList.remove('on');
        this.setSourceLabel(LAYER_NAMES[id] + ' layer disabled: ' + err.message);
        if (window.console) console.error('layer ' + id + ' failed', err);
      }
      ctx.restore();
    }

    this.drawReticle(ctx, probe);
    this.updateChrome(state, probe, element, now);
  };

  /*
   * The physical image, surrendered gradually. The blur is done by resampling
   * through a small offscreen canvas rather than with a canvas filter: a
   * full-frame blur every frame costs more than every overlay combined, and
   * losing resolution is exactly what going down the ladder means anyway.
   */
  App.prototype.drawPassthrough = function (ctx, state) {
    var view = this.view;
    var depth = state.position / scales.maxPosition;
    var alpha = U.clamp(1 - depth * 1.55, 0.05, 1);
    var drew;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (alpha <= 0.06) {
      // Nothing of the image survives at this depth; skip the work entirely.
      drew = false;
    } else if (depth < 0.05) {
      drew = this.source.drawTo(ctx, view.w, view.h);
    } else {
      if (!this.blurCanvas) {
        this.blurCanvas = document.createElement('canvas');
        this.blurCtx = this.blurCanvas.getContext('2d');
      }
      var shrink = 1 + depth * 26;
      var bw = Math.max(8, Math.round(view.w / shrink));
      var bh = Math.max(6, Math.round(view.h / shrink));
      if (this.blurCanvas.width !== bw || this.blurCanvas.height !== bh) {
        this.blurCanvas.width = bw;
        this.blurCanvas.height = bh;
      }
      this.blurCtx.clearRect(0, 0, bw, bh);
      drew = this.source.drawTo(this.blurCtx, bw, bh);
      if (drew) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'low';
        ctx.drawImage(this.blurCanvas, 0, 0, bw, bh, 0, 0, view.w, view.h);
      }
    }
    ctx.restore();

    if (!drew) {
      ctx.fillStyle = '#07090f';
      ctx.fillRect(0, 0, view.w, view.h);
    }
    // Everything below the surface is cold and dark; the overlay supplies the light.
    ctx.fillStyle = 'rgba(4,7,14,' + (depth * 0.62).toFixed(3) + ')';
    ctx.fillRect(0, 0, view.w, view.h);
  };

  App.prototype.drawReticle = function (ctx, probe) {
    var view = this.view;
    var x = this.probeUV.u * view.w, y = this.probeUV.v * view.h;
    var r = 17 * view.dpr;
    ctx.save();
    ctx.lineWidth = Math.max(1, view.dpr);
    ctx.strokeStyle = this.probeLocked ? 'rgba(255,214,120,0.95)' : 'rgba(225,240,255,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 1.9, y); ctx.lineTo(x - r * 0.45, y);
    ctx.moveTo(x + r * 0.45, y); ctx.lineTo(x + r * 1.9, y);
    ctx.moveTo(x, y - r * 1.9); ctx.lineTo(x, y - r * 0.45);
    ctx.moveTo(x, y + r * 0.45); ctx.lineTo(x, y + r * 1.9);
    ctx.stroke();

    ctx.fillStyle = U.wavelengthColor(probe.wavelength, 0.9);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, 2.2 * view.dpr), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /* Drop particle budgets before the frame rate goes with them. */
  App.prototype.adaptQuality = function () {
    var want = this.quality;
    if (this.fpsAvg < 34 && this.quality > 0.2) want = this.quality - 0.12;
    else if (this.fpsAvg > 55 && this.quality < 1) want = Math.min(1, this.quality + 0.04);
    if (Math.abs(want - this.quality) > 0.05) {
      this.quality = want;
      this.view.quality = want;
      this.resetLayers();
    } else {
      this.quality = want;
      this.view.quality = want;
    }
  };

  App.prototype.updateChrome = function (state, probe, element, now) {
    var primary = state.primary;
    if (this.lastRegime !== primary.key) {
      this.lastRegime = primary.key;
      document.getElementById('regime-name').textContent = primary.name;
      document.getElementById('regime-tag').textContent = primary.tag;
      document.getElementById('regime-note').textContent = primary.note;
      scales.REGIMES.forEach(function (r) {
        if (r.tickNode) r.tickNode.classList.toggle('active', r.key === primary.key);
      });
    }

    var magnification = (this.view.cssWidth * CSS_PX_METRES) / state.fov;
    this.hud.update({
      view: this.view,
      probe: probe,
      element: element,
      state: state,
      magnification: magnification
    }, now);

    var badge = document.getElementById('mag-badge');
    if (now - (this.lastBadge || 0) > 110) {
      this.lastBadge = now;
      badge.textContent = 'mag ' + QM.units.pow10(magnification);
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    window.app = new App();
  });
})(window.QM = window.QM || {});
