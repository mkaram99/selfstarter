/*
 * The magnification ladder. Each rung is a regime of physics with its own
 * renderers; the dial moves continuously in log10(field-of-view) and two
 * neighbouring rungs cross-fade so the descent from the physical world into
 * the quantum one never cuts.
 */
(function (QM) {
  'use strict';

  // fov = metres spanned by the width of the viewport at that rung.
  var REGIMES = [
    {
      key: 'ambient', name: 'Ambient', fov: 1.0,
      tag: 'the world as it is',
      note: 'Unmagnified passthrough. The field overlay reads the scene but leaves it intact.',
      layers: ['fieldlines']
    },
    {
      key: 'tissue', name: 'Radiant', fov: 1e-3,
      tag: 'photon transport',
      note: 'Light stops being brightness and becomes countable quanta arriving from every surface.',
      layers: ['fieldlines', 'photons']
    },
    {
      key: 'cell', name: 'Cellular', fov: 2e-5,
      tag: 'membranes and gradients',
      note: 'The last scale where matter still looks like structure rather than probability.',
      layers: ['fieldlines', 'photons', 'cells']
    },
    {
      key: 'wave', name: 'Wavefront', fov: 4e-6,
      tag: 'light as a wave',
      note: 'The view is a few wavelengths across. Colour becomes geometry: fringes, phase, and two sources interfering.',
      layers: ['fieldlines', 'waves', 'photons']
    },
    {
      key: 'molecule', name: 'Molecular', fov: 5e-9,
      tag: 'bonds and thermal motion',
      note: 'Bonds sampled from the scene. Every atom is jittering with the ambient thermal energy.',
      layers: ['fieldlines', 'molecules', 'waves']
    },
    {
      key: 'atom', name: 'Atomic', fov: 5e-10,
      tag: 'orbitals, not shells',
      note: 'Electrons are standing waves of probability. The cloud is where the electron is likely to be found, nothing more.',
      layers: ['orbitals', 'molecules']
    },
    {
      key: 'nucleus', name: 'Nuclear', fov: 8e-15,
      tag: 'the strong force',
      note: 'Nearly all the mass, almost none of the volume. Protons and neutrons bound by a force that does not fall off.',
      layers: ['orbitals', 'nucleus']
    },
    {
      key: 'quark', name: 'Partonic', fov: 2.4e-15,
      tag: 'colour confinement',
      note: 'Quarks carry colour charge. The camera pixel becomes literal: its RGB sets the colour-charge mix of this nucleon.',
      layers: ['nucleus', 'quarks']
    },
    {
      key: 'vacuum', name: 'Vacuum', fov: 1e-18,
      tag: 'fields and fluctuation',
      note: 'Below every particle: fields at their ground state, borrowing energy against the clock and paying it back.',
      layers: ['quarks', 'vacuum']
    }
  ];

  REGIMES.forEach(function (r) { r.logFov = Math.log(r.fov) / Math.LN10; });

  var MIN_LOG = REGIMES[REGIMES.length - 1].logFov;
  var MAX_LOG = REGIMES[0].logFov;

  function smoothstep(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  /*
   * Dial position is a continuous index into REGIMES so the slider feels even
   * even though the rungs are decades apart. Returns the bracketing regimes
   * and a cross-fade weight.
   */
  function stateFromPosition(pos) {
    var maxIndex = REGIMES.length - 1;
    var p = pos < 0 ? 0 : pos > maxIndex ? maxIndex : pos;
    var i = Math.floor(p);
    if (i >= maxIndex) i = maxIndex - 1;
    var f = p - i;
    var a = REGIMES[i];
    var b = REGIMES[i + 1];
    var logFov = a.logFov + (b.logFov - a.logFov) * f;
    var blend = smoothstep((f - 0.25) / 0.5);

    return {
      position: p,
      fov: Math.pow(10, logFov),
      logFov: logFov,
      lower: a,
      upper: b,
      // Below the first quarter of a gap we are fully in `lower`; above the
      // last quarter fully in `upper`; between, both draw.
      weights: [
        { regime: a, weight: 1 - blend },
        { regime: b, weight: blend }
      ],
      primary: blend < 0.5 ? a : b
    };
  }

  function positionFromLogFov(logFov) {
    var l = Math.max(MIN_LOG, Math.min(MAX_LOG, logFov));
    for (var i = 0; i < REGIMES.length - 1; i++) {
      var a = REGIMES[i], b = REGIMES[i + 1];
      if (l <= a.logFov && l >= b.logFov) {
        return i + (a.logFov - l) / (a.logFov - b.logFov);
      }
    }
    return 0;
  }

  /*
   * Per-layer opacity for the current dial position: a layer used by both
   * bracketing regimes stays fully on across the transition instead of
   * fading out and straight back in.
   */
  function layerWeights(state) {
    var out = {};
    state.weights.forEach(function (w) {
      w.regime.layers.forEach(function (id) {
        out[id] = Math.max(out[id] || 0, w.weight);
      });
    });
    return out;
  }

  QM.scales = {
    REGIMES: REGIMES,
    MIN_LOG: MIN_LOG,
    MAX_LOG: MAX_LOG,
    maxPosition: REGIMES.length - 1,
    smoothstep: smoothstep,
    stateFromPosition: stateFromPosition,
    positionFromLogFov: positionFromLogFov,
    layerWeights: layerWeights
  };
})(window.QM = window.QM || {});
