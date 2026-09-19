/*
 * The instrument.
 *
 * A lens you aim. The world stays where it is; inside the aperture the
 * instrument finds whatever object is under it, takes that object's outline
 * as a boundary condition, and draws the standing wave it would carry --
 * with the deeper structure layered into the same silhouette.
 *
 * The dial is a frequency sweep as much as a magnification: further down
 * means shorter wavelength, more nodes, finer structure. That is one
 * statement in two languages, which is the reason the two halves of this
 * thing fit together at all.
 */
(function (QM) {
  'use strict';

  var U = QM.util, C = QM.C, scales = QM.scales;
  var CSS_PX_METRES = 0.0002646;   // 1 CSS pixel at the nominal 96 dpi

  var LAYER_NAMES = {
    cymatic: 'Figure',
    harmonics: 'Harmonics',
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
    this.field = new QM.Field(96);
    this.hud = new QM.Hud(document.getElementById('readouts'));
    this.segment = new QM.Segment();
    this.resonance = new QM.Resonance(128);

    this.source = new QM.SyntheticSource();
    this.position = 0;
    this.target = 0;
    this.paused = false;
    this.quality = 1;
    this.disabled = {};
    // The aperture, in units of the frame width. Everything the instrument
    // claims to know is measured inside it.
    this.lens = { u: 0.5, v: 0.5, r: 0.2, box: { x: 0, y: 0, size: 1 } };
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

    // Drag to aim the lens, pinch to magnify.
    var pointers = {};
    var pinchStart = null;
    this.canvas.addEventListener('pointerdown', function (e) {
      self.canvas.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 1) self.aimAt(e.clientX, e.clientY);
      if (ids.length === 2) {
        pinchStart = { dist: pointerDistance(pointers, ids), pos: self.target };
      }
    });
    this.canvas.addEventListener('pointermove', function (e) {
      var p = pointers[e.pointerId];
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      var ids = Object.keys(pointers);
      if (ids.length === 2 && pinchStart) {
        var d = pointerDistance(pointers, ids);
        if (pinchStart.dist > 10 && d > 10) {
          // Each doubling of the pinch is a step down the ladder.
          self.setTarget(pinchStart.pos + Math.log(d / pinchStart.dist) / Math.LN2 * 1.1);
        }
      } else if (ids.length === 1) {
        self.aimAt(e.clientX, e.clientY);
      }
    });
    function release(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinchStart = null;
    }
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);

    var aperture = document.getElementById('aperture');
    aperture.addEventListener('input', function () {
      self.lens.r = parseFloat(aperture.value);
    });
    aperture.value = this.lens.r;

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
        case 'r': self.lens.u = 0.5; self.lens.v = 0.5; break;
        case '[': self.setAperture(self.lens.r - 0.02); break;
        case ']': self.setAperture(self.lens.r + 0.02); break;
        case 'Escape':
          document.getElementById('about').classList.add('hidden');
          var cap = document.getElementById('capture');
          if (cap) cap.classList.add('hidden');
          break;
        default:
          if (e.key >= '1' && e.key <= '9') self.setTarget(parseInt(e.key, 10) - 1);
      }
    });
  };

  function pointerDistance(pointers, ids) {
    var a = pointers[ids[0]], b = pointers[ids[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  App.prototype.aimAt = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var u = (clientX - rect.left) / rect.width;
    var v = (clientY - rect.top) / rect.height;
    this.lens.u = U.clamp(u, 0, 1);
    this.lens.v = U.clamp(v, 0, 1);
  };

  App.prototype.setAperture = function (r) {
    this.lens.r = U.clamp(r, 0.07, 0.45);
    var slider = document.getElementById('aperture');
    if (slider) slider.value = this.lens.r;
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

  /*
   * A scripted download is inert in a sandboxed frame and has never worked
   * for a data URL on mobile Safari, so the capture is shown instead and the
   * viewer saves it the way they save any other image.
   */
  App.prototype.snapshot = function () {
    var url;
    try {
      url = this.canvas.toDataURL('image/png');
    } catch (e) {
      this.setSourceLabel('capture blocked by the browser');
      return;
    }
    this.showCapture(url);
  };

  App.prototype.showCapture = function (url) {
    var sheet = document.getElementById('capture');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'capture';
      sheet.className = 'hidden';
      sheet.innerHTML =
        '<div class="sheet">' +
        '<button id="capture-close" type="button" aria-label="Close">&times;</button>' +
        '<h2>Capture</h2>' +
        '<img id="capture-image" alt="Captured frame">' +
        '<p class="fine dim">Long-press or right-click the image to save it.</p>' +
        '</div>';
      document.body.appendChild(sheet);
      sheet.querySelector('#capture-close').addEventListener('click', function () {
        sheet.classList.add('hidden');
      });
    }
    document.getElementById('capture-image').src = url;
    sheet.classList.remove('hidden');
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
    var lens = this.lens;
    var state = scales.stateFromPosition(this.position);
    var aspectY = view.h / view.w;
    view.fov = state.fov;
    view.mpp = state.fov / view.w;

    lens.box.size = lens.r * 2 * view.w;
    lens.box.x = lens.u * view.w - lens.r * view.w;
    lens.box.y = lens.v * view.h - lens.r * view.w;

    // The scene is re-read at about 30 Hz. Pulling a video frame through a
    // canvas is the most expensive thing in the loop, and the overlay
    // animates on its own clock, so reading it every frame buys nothing.
    if (!this.paused && now - (this.lastFieldRead || 0) >= 32) {
      this.lastFieldRead = now;
      this.field.update(this.source, view.w / view.h);
      this.segment.update(this.field, lens, aspectY);
    }

    this.runResonance(state, dt);

    var probe = this.field.probe(lens.u, lens.v, view.mpp);
    var element = U.elementFor(probe.hue, probe.sat, probe.lum);

    var ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);

    // The world, untouched. The instrument is a thing held up against it,
    // not a replacement for it.
    this.drawWorld(ctx);

    var frame = {
      field: this.field,
      view: view,
      lens: lens,
      aspectY: aspectY,
      segment: this.segment,
      resonance: this.resonance,
      t: now / 1000,
      dt: this.paused ? 0 : dt,
      weight: 1,
      probe: probe,
      element: element,
      state: state,
      weights: scales.layerWeights(state)
    };

    ctx.save();
    ctx.beginPath();
    ctx.arc(lens.u * view.w, lens.v * view.h, lens.r * view.w, 0, Math.PI * 2);
    ctx.clip();
    this.drawLensInterior(ctx, frame, state);
    ctx.restore();

    this.drawLensChrome(ctx, frame);
    this.updateChrome(state, probe, element, now);
  };

  /* Everything inside the aperture. */
  App.prototype.drawLensInterior = function (ctx, frame, state) {
    var view = this.view, lens = this.lens;
    var depth = state.position / scales.maxPosition;

    // The world stays where it is outside the rim. Inside, the glass goes
    // dark so the figure can be read -- an eyepiece, not a tinted window.
    ctx.fillStyle = 'rgba(5,7,14,' + (0.72 + depth * 0.22).toFixed(3) + ')';
    ctx.fillRect(lens.box.x - 4, lens.box.y - 4, lens.box.size + 8, lens.box.size + 8);

    this.drawLayer(ctx, frame, 'cymatic', 1);

    // The structural layers belong to the object, so they are cut to its
    // silhouette rather than filling the aperture.
    var clip = this.objectPath(frame);
    if (clip) {
      ctx.save();
      ctx.clip(clip);
      var order = ['fieldlines', 'waves', 'cells', 'molecules', 'orbitals',
                   'nucleus', 'quarks', 'vacuum', 'photons'];
      for (var i = 0; i < order.length; i++) {
        var w = frame.weights[order[i]];
        if (w) this.drawLayer(ctx, frame, order[i], w);
      }
      ctx.restore();
    }

    this.drawLayer(ctx, frame, 'harmonics', 1);
  };

  App.prototype.drawLayer = function (ctx, frame, id, weight) {
    if (weight < 0.012 || this.disabled[id]) return;
    var layer = QM.layers.get(id);
    if (!layer) return;
    frame.weight = weight;
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
  };

  /* The measured outline, as a clip path in device pixels. Aspect-corrected
     coordinates scale to pixels by the frame width on both axes. */
  App.prototype.objectPath = function (frame) {
    var seg = this.segment, view = this.view;
    if (!seg.stats.found) return null;
    var rays = QM.SEGMENT_RAYS;
    var path = new Path2D();
    for (var k = 0; k < rays; k++) {
      var x = seg.outline[k * 2] * view.w;
      var y = seg.outline[k * 2 + 1] * view.w;
      if (k === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    path.closePath();
    return path;
  };

  /*
   * Drive the membrane. The dial sets the frequency; how fast the object is
   * moving and how textured it is set the damping, so a still smooth surface
   * rings cleanly and a busy one smears -- which is what happens.
   */
  App.prototype.runResonance = function (state) {
    var res = this.resonance, seg = this.segment;
    var n = this.quality > 0.6 ? 128 : 96;
    if (res.n !== n) { res.allocate(n); res.clear(); }
    if (!seg.stats.found) { res.insideCells = 0; return; }

    res.setMask(seg, this.lens, this.view.h / this.view.w);
    if (this.paused) return;

    var st = seg.stats;
    var tone = state.position / scales.maxPosition;
    // Light damping, or the wave decays before it has crossed the plate and
    // there is no mode to find -- only a blob around the driver. Motion and
    // texture still blur the figure, just within a usable range.
    var damping = U.clamp(0.0004 + st.motion * 0.006 + st.texture * 0.0009,
                          0.0004, 0.003);
    res.step(tone, damping, 0.9);
  };

  /* The world outside the aperture: the camera, as it is. */
  App.prototype.drawWorld = function (ctx) {
    var view = this.view, lens = this.lens;
    if (!this.source.drawTo(ctx, view.w, view.h)) {
      ctx.fillStyle = '#07090f';
      ctx.fillRect(0, 0, view.w, view.h);
    }
    // Just enough fall-off that the lit aperture reads as the subject.
    var cx = lens.u * view.w, cy = lens.v * view.h;
    var vignette = ctx.createRadialGradient(
      cx, cy, lens.r * view.w, cx, cy, Math.max(view.w, view.h) * 0.85);
    vignette.addColorStop(0, 'rgba(4,6,13,0.10)');
    vignette.addColorStop(1, 'rgba(4,6,13,0.72)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, view.w, view.h);
  };

  /* The barrel. A rim, the chromatic edge any real lens has, and an arc
     reporting how close the drive is to a mode of this object. */
  App.prototype.drawLensChrome = function (ctx) {
    var view = this.view, lens = this.lens;
    var cx = lens.u * view.w, cy = lens.v * view.h, r = lens.r * view.w;
    var lock = this.segment.stats.found ? this.resonance.lock : 0;

    ctx.save();
    ctx.lineWidth = Math.max(1.5, view.dpr * 1.6);
    ctx.strokeStyle = 'rgba(255,205,125,' + (0.4 + lock * 0.5).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(1, view.dpr);
    ctx.strokeStyle = 'rgba(120,190,255,0.30)';
    ctx.beginPath();
    ctx.arc(cx, cy, r - view.dpr * 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,190,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + view.dpr * 2.5, 0, Math.PI * 2);
    ctx.stroke();

    if (lock > 0.02) {
      ctx.lineWidth = Math.max(2, view.dpr * 2.6);
      ctx.strokeStyle = 'rgba(255,228,160,0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, r + view.dpr * 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lock);
      ctx.stroke();
    }
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
      object: this.segment.stats,
      resonance: this.resonance,
      lens: this.lens,
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
