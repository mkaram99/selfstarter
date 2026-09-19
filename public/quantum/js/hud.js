/*
 * The readout. Everything here is derived from the probed point of the scene
 * and the current magnification, so the numbers move when you move the
 * instrument.
 */
(function (QM) {
  'use strict';

  var si = QM.units.si, pow10 = QM.units.pow10, C = QM.C;

  var GROUPS = [
    {
      title: 'Scale',
      rows: [
        { key: 'fov', label: 'Field of view', calc: function (s) { return si(s.view.fov, 'm'); } },
        { key: 'mag', label: 'Magnification', calc: function (s) { return pow10(s.magnification); } },
        { key: 'dx', label: 'One pixel is', calc: function (s) { return si(s.view.mpp, 'm'); } },
        { key: 'clock', label: 'Scene time per display s', calc: function (s) {
            // Light crosses the frame about three times a second on screen.
            return si(s.view.fov / C.c * 3.3, 's');
          } }
      ]
    },
    {
      title: 'Light at the reticle',
      rows: [
        { key: 'lambda', label: 'Dominant λ', calc: function (s) { return si(s.probe.wavelength, 'm'); }, swatch: true },
        { key: 'eg', label: 'Photon energy', calc: function (s) { return s.probe.photonEnergyEv.toFixed(2) + ' eV'; } },
        { key: 'flux', label: 'Photon flux', calc: function (s) { return si(s.probe.photonFlux, 'm⁻² s⁻¹', 2); } },
        { key: 'efield', label: 'Field amplitude', calc: function (s) { return si(s.probe.eField, 'V/m'); } },
        { key: 'ued', label: 'Energy density', calc: function (s) { return si(s.probe.energyDensity, 'J/m³'); } },
        { key: 'coh', label: 'Coherence', calc: function (s) { return (s.probe.coherence * 100).toFixed(0) + '%'; } }
      ]
    },
    {
      title: 'Matter at the reticle',
      rows: [
        { key: 'el', label: 'Composition', calc: function (s) {
            return s.element.sym + ' · Z=' + s.element.Z + ' A=' + s.element.A;
          } },
        { key: 'orb', label: 'Outer subshell', calc: function (s) { return s.element.shell + s.element.orbital; } },
        { key: 'temp', label: 'Agitation', calc: function (s) { return s.probe.temperature.toFixed(0) + ' K · ' + (s.probe.thermalEv * 1000).toFixed(0) + ' meV'; } },
        { key: 'ldb', label: 'Electron λ (de Broglie)', calc: function (s) { return si(s.probe.deBroglie, 'm'); } }
      ]
    },
    {
      title: 'Limits',
      rows: [
        { key: 'dp', label: 'Δp c ≥ ħc/2Δx', calc: function (s) { return si(s.probe.dpc, 'eV'); } },
        { key: 'dv', label: 'Electron confinement E', calc: function (s) { return si(s.probe.confinement, 'eV'); } },
        { key: 'planck', label: 'Planck lengths across', calc: function (s) {
            return pow10(s.view.fov / C.lPlanck, 2);
          } }
      ]
    }
  ];

  function Hud(root) {
    this.root = root;
    this.cells = {};
    this.swatches = {};
    this.build();
    this.last = 0;
  }

  Hud.prototype.build = function () {
    var self = this;
    var frag = document.createDocumentFragment();
    GROUPS.forEach(function (group) {
      var section = document.createElement('section');
      section.className = 'readout-group';
      var h = document.createElement('h3');
      h.textContent = group.title;
      section.appendChild(h);
      group.rows.forEach(function (row) {
        var div = document.createElement('div');
        div.className = 'readout-row';
        var label = document.createElement('span');
        label.className = 'readout-label';
        label.textContent = row.label;
        var value = document.createElement('span');
        value.className = 'readout-value';
        if (row.swatch) {
          var sw = document.createElement('i');
          sw.className = 'swatch';
          value.appendChild(sw);
          self.swatches[row.key] = sw;
        }
        var text = document.createElement('b');
        text.textContent = '—';
        value.appendChild(text);
        div.appendChild(label);
        div.appendChild(value);
        section.appendChild(div);
        self.cells[row.key] = { node: text, calc: row.calc };
      });
      frag.appendChild(section);
    });
    this.root.appendChild(frag);
  };

  /* Updated a few times a second: the numbers are readings, not an animation. */
  Hud.prototype.update = function (state, now) {
    if (now - this.last < 110) return;
    this.last = now;
    for (var key in this.cells) {
      if (!this.cells.hasOwnProperty(key)) continue;
      var cell = this.cells[key];
      var text;
      try { text = cell.calc(state); } catch (e) { text = '—'; }
      if (cell.node.textContent !== text) cell.node.textContent = text;
    }
    if (this.swatches.lambda) {
      this.swatches.lambda.style.background = QM.util.wavelengthColor(state.probe.wavelength, 1);
    }
  };

  QM.Hud = Hud;
})(window.QM = window.QM || {});
