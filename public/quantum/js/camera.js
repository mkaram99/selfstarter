/*
 * The physical input. A rear camera when we can get one, a procedural stand-in
 * when we cannot, behind the same interface: something that can paint itself
 * into a 2D context with cover-fit geometry.
 */
(function (QM) {
  'use strict';

  function coverRect(srcW, srcH, dstW, dstH) {
    if (!srcW || !srcH) return { x: 0, y: 0, w: dstW, h: dstH };
    var scale = Math.max(dstW / srcW, dstH / srcH);
    var w = srcW * scale, h = srcH * scale;
    return { x: (dstW - w) / 2, y: (dstH - h) / 2, w: w, h: h };
  }

  function CameraSource(video) {
    this.kind = 'camera';
    this.video = video;
    this.stream = null;
    this.facing = 'environment';
    this.mirrored = false;
  }

  CameraSource.prototype.ready = function () {
    return this.video.readyState >= 2 && this.video.videoWidth > 0;
  };

  CameraSource.prototype.open = function (facing) {
    var self = this;
    this.facing = facing || this.facing;
    this.close();
    var constraints = {
      audio: false,
      video: {
        facingMode: this.facing === 'user' ? 'user' : { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    return navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      self.stream = stream;
      self.mirrored = self.facing === 'user';
      self.video.srcObject = stream;
      return self.video.play().then(function () { return self; });
    });
  };

  CameraSource.prototype.close = function () {
    if (this.stream) {
      this.stream.getTracks().forEach(function (t) { t.stop(); });
      this.stream = null;
    }
    this.video.srcObject = null;
  };

  CameraSource.prototype.drawTo = function (ctx, w, h) {
    if (!this.ready()) return false;
    var r = coverRect(this.video.videoWidth, this.video.videoHeight, w, h);
    if (this.mirrored) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.video, w - r.x - r.w, r.y, r.w, r.h);
      ctx.restore();
    } else {
      ctx.drawImage(this.video, r.x, r.y, r.w, r.h);
    }
    return true;
  };

  CameraSource.prototype.label = function () {
    if (!this.stream) return 'camera';
    var track = this.stream.getVideoTracks()[0];
    var s = track && track.getSettings ? track.getSettings() : {};
    return (this.facing === 'user' ? 'front' : 'rear') + ' camera · ' +
      (s.width || this.video.videoWidth) + '×' + (s.height || this.video.videoHeight);
  };

  /*
   * Stand-in specimen for desktops and denied permissions: a lit scene with
   * warm and cool sources, drifting so the temporal channel has something to
   * read. Not a camera, but it exercises every stage of the translation.
   */
  function SyntheticSource() {
    this.kind = 'synthetic';
    this.mirrored = false;
    this.t0 = performance.now();
    this.blobs = [];
    for (var i = 0; i < 7; i++) {
      this.blobs.push({
        x: Math.random(), y: Math.random(),
        r: 0.12 + Math.random() * 0.25,
        hue: [12, 38, 190, 280, 150, 55, 330][i],
        phase: Math.random() * Math.PI * 2,
        drift: 0.02 + Math.random() * 0.05
      });
    }
  }

  SyntheticSource.prototype.ready = function () { return true; };
  SyntheticSource.prototype.open = function () { return Promise.resolve(this); };
  SyntheticSource.prototype.close = function () {};
  SyntheticSource.prototype.label = function () { return 'simulated specimen'; };

  SyntheticSource.prototype.drawTo = function (ctx, w, h) {
    var t = (performance.now() - this.t0) / 1000;
    var bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0b1020');
    bg.addColorStop(1, '#1a1226');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < this.blobs.length; i++) {
      var b = this.blobs[i];
      var cx = (b.x + Math.sin(t * b.drift + b.phase) * 0.06) * w;
      var cy = (b.y + Math.cos(t * b.drift * 1.3 + b.phase) * 0.06) * h;
      var rad = b.r * Math.min(w, h) * (0.9 + 0.1 * Math.sin(t * 0.7 + b.phase));
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'hsla(' + b.hue + ', 85%, 62%, 0.85)');
      g.addColorStop(0.45, 'hsla(' + b.hue + ', 80%, 45%, 0.30)');
      g.addColorStop(1, 'hsla(' + b.hue + ', 75%, 30%, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    return true;
  };

  QM.CameraSource = CameraSource;
  QM.SyntheticSource = SyntheticSource;
  QM.coverRect = coverRect;
})(window.QM = window.QM || {});
