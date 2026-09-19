/*
 * Shared drawing utilities and the layer registry.
 *
 * A layer is an object with an optional reset(view) and a draw(ctx, frame).
 * `frame` carries everything a renderer is allowed to know: the translated
 * field, the current view geometry, time, and its own cross-fade weight.
 */
(function (QM) {
  'use strict';

  var layers = {};

  function register(id, layer) {
    layer.id = id;
    layers[id] = layer;
    return layer;
  }

  function get(id) { return layers[id]; }

  /* Deterministic RNG so lattices and packings stay put between frames. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function hsla(h, s, l, a) {
    return 'hsla(' + (((h % 360) + 360) % 360).toFixed(1) + ',' + s + '%,' + l + '%,' + a.toFixed(3) + ')';
  }

  /* Approximate sRGB for a visible wavelength; used wherever colour should
     read as "this is what that photon energy looks like". */
  function wavelengthColor(lambdaMetres, alpha) {
    var nm = lambdaMetres * 1e9;
    var r = 0, g = 0, b = 0;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else { r = 1; }
    var falloff = 1;
    if (nm > 700) falloff = clamp(0.3 + 0.7 * (780 - nm) / 80, 0, 1);
    else if (nm < 420) falloff = clamp(0.3 + 0.7 * (nm - 380) / 40, 0, 1);
    var gamma = function (v) { return Math.round(255 * Math.pow(clamp(v * falloff, 0, 1), 0.8)); };
    return 'rgba(' + gamma(r) + ',' + gamma(g) + ',' + gamma(b) + ',' + (alpha == null ? 1 : alpha) + ')';
  }

  /*
   * The scene's colour read as chemistry. A camera cannot see elements, so
   * this is an explicit, stated convention rather than a measurement: it gives
   * the molecular and nuclear layers a composition that varies with what you
   * point at, consistently.
   */
  // zeff is the Slater effective nuclear charge seen by the outermost shell;
  // it sets how far the orbital layer draws the electron cloud. `orbital` is
  // the outermost occupied subshell, which sets the cloud's shape.
  var ELEMENTS = [
    { sym: 'H', Z: 1, A: 1, zeff: 1.00, orbital: 's', shell: 1, color: '#f2f5ff', radius: 0.53e-10 },
    { sym: 'C', Z: 6, A: 12, zeff: 3.14, orbital: 'p', shell: 2, color: '#6d7787', radius: 0.67e-10 },
    { sym: 'N', Z: 7, A: 14, zeff: 3.83, orbital: 'p', shell: 2, color: '#4c7bd8', radius: 0.56e-10 },
    { sym: 'O', Z: 8, A: 16, zeff: 4.45, orbital: 'p', shell: 2, color: '#e2503f', radius: 0.48e-10 },
    { sym: 'P', Z: 15, A: 31, zeff: 4.89, orbital: 'p', shell: 3, color: '#e08a3c', radius: 0.98e-10 },
    { sym: 'S', Z: 16, A: 32, zeff: 5.48, orbital: 'p', shell: 3, color: '#e0b93c', radius: 0.88e-10 },
    { sym: 'Fe', Z: 26, A: 56, zeff: 3.75, orbital: 'd', shell: 3, color: '#c88a5a', radius: 1.56e-10 }
  ];

  function elementFor(hue, sat, lum) {
    if (sat < 0.18) return lum > 0.6 ? ELEMENTS[0] : ELEMENTS[1];      // white -> H, grey -> C
    if (hue < 20 || hue >= 330) return ELEMENTS[3];                     // red -> O
    if (hue < 45) return ELEMENTS[4];                                   // orange -> P
    if (hue < 70) return ELEMENTS[5];                                   // yellow -> S
    if (hue < 170) return ELEMENTS[1];                                  // green -> C
    if (hue < 260) return ELEMENTS[2];                                  // blue -> N
    return ELEMENTS[6];                                                 // violet -> Fe
  }

  /* Soft radial sprite, cached per colour+size bucket. */
  var spriteCache = {};
  function glowSprite(color, radius) {
    var key = color + '|' + radius;
    var hit = spriteCache[key];
    if (hit) return hit;
    var size = Math.max(4, Math.ceil(radius * 2));
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)'));
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    if (Object.keys(spriteCache).length > 120) spriteCache = {};
    spriteCache[key] = cv;
    return cv;
  }

  QM.layers = { register: register, get: get, all: layers };
  QM.util = {
    mulberry32: mulberry32,
    lerp: lerp,
    clamp: clamp,
    hsla: hsla,
    wavelengthColor: wavelengthColor,
    elementFor: elementFor,
    ELEMENTS: ELEMENTS,
    glowSprite: glowSprite
  };
})(window.QM = window.QM || {});
