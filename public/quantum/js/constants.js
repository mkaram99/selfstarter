/*
 * Physical constants and the conversions used to translate what the camera
 * sees into quantum-scale observables. SI units throughout unless a function
 * name says otherwise.
 */
(function (QM) {
  'use strict';

  var C = {
    h: 6.62607015e-34,          // Planck constant, J s
    hbar: 1.054571817e-34,      // reduced Planck constant, J s
    c: 299792458,               // speed of light, m/s
    e: 1.602176634e-19,         // elementary charge, C
    me: 9.1093837015e-31,       // electron mass, kg
    mp: 1.67262192369e-27,      // proton mass, kg
    kB: 1.380649e-23,           // Boltzmann constant, J/K
    eps0: 8.8541878128e-12,     // vacuum permittivity, F/m
    a0: 5.29177210903e-11,      // Bohr radius, m
    reComp: 2.42631023867e-12,  // Compton wavelength of the electron, m
    rProton: 0.8414e-15,        // proton charge radius, m
    lPlanck: 1.616255e-35,      // Planck length, m
    T0: 290                     // ambient reference temperature, K
  };

  // A lit indoor scene is on the order of 1 W/m^2 of visible irradiance.
  // Camera luminance is relative, so this anchors the whole readout chain.
  C.irradianceRef = 1.0;

  var SI_PREFIX = [
    { e: -24, s: 'y' }, { e: -21, s: 'z' }, { e: -18, s: 'a' },
    { e: -15, s: 'f' }, { e: -12, s: 'p' }, { e: -9, s: 'n' },
    { e: -6, s: 'µ' }, { e: -3, s: 'm' }, { e: 0, s: '' },
    { e: 3, s: 'k' }, { e: 6, s: 'M' }, { e: 9, s: 'G' },
    { e: 12, s: 'T' }, { e: 15, s: 'P' }, { e: 18, s: 'E' }
  ];

  /* 2.4e-10 -> "240 pm". Falls back to exponent form outside the prefix range. */
  function si(value, unit, digits) {
    if (!isFinite(value)) return '—';
    if (value === 0) return '0 ' + (unit || '');
    var sign = value < 0 ? '-' : '';
    var v = Math.abs(value);
    var exp = Math.floor(Math.log(v) / Math.LN10);
    var group = Math.floor(exp / 3) * 3;
    var found = null;
    for (var i = 0; i < SI_PREFIX.length; i++) {
      if (SI_PREFIX[i].e === group) { found = SI_PREFIX[i]; break; }
    }
    if (!found) return sign + v.toExponential(digits == null ? 2 : digits) + ' ' + (unit || '');
    var mant = v / Math.pow(10, group);
    return sign + mant.toFixed(digits == null ? (mant < 10 ? 2 : mant < 100 ? 1 : 0) : digits) +
      ' ' + found.s + (unit || '');
  }

  /* Compact power-of-ten label for the magnification badge. */
  function pow10(value, digits) {
    if (!isFinite(value) || value <= 0) return '—';
    var exp = Math.floor(Math.log(value) / Math.LN10);
    var mant = value / Math.pow(10, exp);
    if (exp === 0) return mant.toFixed(digits == null ? 1 : digits);
    return mant.toFixed(digits == null ? 1 : digits) + '× 10' + superscript(exp);
  }

  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³',
    '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  function superscript(n) {
    return String(n).split('').map(function (ch) { return SUP[ch] || ch; }).join('');
  }

  /*
   * Hue -> dominant wavelength. The visible spectrum is not a hue circle, so
   * this is an approximation: red through violet is mapped monotonically and
   * the non-spectral magentas fold back to the violet end.
   */
  function hueToWavelength(hue) {
    var h = ((hue % 360) + 360) % 360;
    if (h <= 270) return (700 - h * (700 - 400) / 270) * 1e-9;
    // 270..360 is magenta: extrapolate back toward deep red through violet.
    var t = (h - 270) / 90;
    return (400 + t * 300) * 1e-9;
  }

  function photonEnergy(lambda) { return C.h * C.c / lambda; }            // J
  function joulesToEv(j) { return j / C.e; }
  function photonFlux(irradiance, lambda) {                               // photons m^-2 s^-1
    return irradiance / photonEnergy(lambda);
  }
  function energyDensity(irradiance) { return irradiance / C.c; }         // J/m^3
  function fieldAmplitude(irradiance) {                                   // V/m
    return Math.sqrt(2 * irradiance / (C.c * C.eps0));
  }
  function deBroglie(kineticEnergy, mass) {                               // m
    var m = mass || C.me;
    if (kineticEnergy <= 0) return Infinity;
    return C.h / Math.sqrt(2 * m * kineticEnergy);
  }
  /* Momentum floor implied by localising a particle to dx. */
  function momentumBound(dx) { return C.hbar / (2 * dx); }
  /*
   * The same bound as an energy, which stays meaningful where a velocity
   * would not: below a Compton wavelength, hbar/2m dx exceeds c and the
   * non-relativistic reading is simply wrong.
   */
  function confinementEnergy(dx, mass) {
    var m = mass || C.me;
    var pc = momentumBound(dx) * C.c;               // J
    var rest = m * C.c * C.c;                        // J
    // sqrt(pc^2 + rest^2) - rest cancels to exactly zero in doubles whenever
    // pc/rest is below about 1e-8, which is most of the dial. This form is
    // algebraically the same and keeps its precision all the way down.
    return (pc * pc) / (Math.sqrt(pc * pc + rest * rest) + rest);  // J
  }
  /* Lifetime a virtual excitation of energy dE can borrow from the vacuum. */
  function virtualLifetime(dE) { return C.hbar / (2 * dE); }
  function thermalEnergy(T) { return C.kB * T; }

  QM.C = C;
  QM.units = {
    si: si,
    pow10: pow10,
    superscript: superscript
  };
  QM.phys = {
    hueToWavelength: hueToWavelength,
    photonEnergy: photonEnergy,
    joulesToEv: joulesToEv,
    photonFlux: photonFlux,
    energyDensity: energyDensity,
    fieldAmplitude: fieldAmplitude,
    deBroglie: deBroglie,
    momentumBound: momentumBound,
    confinementEnergy: confinementEnergy,
    virtualLifetime: virtualLifetime,
    thermalEnergy: thermalEnergy
  };
})(window.QM = window.QM || {});
