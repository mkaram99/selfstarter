# Quantum Magnifier

An augmented-reality instrument that keeps magnifying the scene in front of the
camera past the point where there is anything left to see, and draws what is
there instead: photons, bonds, electron probability, colour charge, and finally
the vacuum underneath all of it.

It is a self-contained static app. No build step, no dependencies, no network
at runtime. Open `public/quantum/index.html` directly, or run the Rails app and
visit `/quantum`.

## What it does

The camera frame is reduced to a coarse grid every 1/30 s, and each cell is read
as a small set of physical quantities. Every overlay is drawn from that grid, so
what you see is a reading of the actual scene rather than an animation playing
on top of it.

| Measured | Translated to |
| --- | --- |
| Luminance | Irradiance, anchored at 1 W/m² for a lit scene → photon flux, field amplitude `√(2I/cε₀)`, energy density `I/c` |
| Hue | Dominant wavelength → photon energy `hc/λ`, electron de Broglie length `h/√(2mE)` |
| Saturation | Spectral purity, used as a coherence proxy |
| Luminance gradient | Field direction — the field lines over the scene are its streamlines |
| Frame-to-frame change | Agitation → thermal amplitude and the decoherence term |
| Magnification | `Δx`, the real size of one screen pixel → the momentum bound `Δp ≥ ħ/2Δx` |

## The ladder

The dial moves continuously in `log₁₀(field of view)`. Nine rungs, each with its
own renderers; neighbouring rungs cross-fade so the descent never cuts.

| Rung | Field of view | What appears |
| --- | --- | --- |
| Ambient | 1 m | Untouched passthrough with the field overlay |
| Radiant | 1 mm | Light resolved into quanta leaving the bright parts of the scene |
| Cellular | 20 µm | The last scale that draws objects with edges |
| Wavefront | 4 µm | Light as a wave: fringes, phase, two sources interfering |
| Molecular | 5 nm | A bond lattice at true bond length, jittering with the ambient thermal energy |
| Atomic | 500 pm | Electron probability clouds sampled from hydrogenic \|ψ\|² |
| Nuclear | 8 fm | Nucleons packed into `1.2 fm · A^(1/3)`, bound by pion exchange |
| Partonic | 2.4 fm | Three valence quarks, colour charge, gluon flux tubes, sea pairs |
| Vacuum | 1 am | Virtual pairs borrowing against `ħ/2ΔE`, over the scene as an energy landscape |

## Drawn to scale, and drawn by convention

Distances are honest. Bond lengths, Bohr radii, nuclear and nucleon radii are all
rendered at the dial's current metres-per-pixel, so the jumps between rungs are
the real ones. Orbital clouds are sampled from the hydrogenic radial
distributions — Γ(3, a₀/2) for 1s, Γ(5, a₀) for 2p, Γ(7, 3a₀/2) for 3d — scaled
by the Slater effective charge.

Three things are stated convention rather than measurement, because a camera
cannot see them:

- **Colour → element.** Red reads as oxygen, blue as nitrogen, green and grey as
  carbon, white as hydrogen, yellow as sulfur, orange as phosphorus, violet as
  iron.
- **Pixel RGB → colour charge.** At the partonic rung the three channels weight
  the three colour charges. The pun is deliberate; the confinement physics drawn
  around it is not.
- **Time.** Light crosses a micrometre in femtoseconds. The display clock is
  slowed by the factor the readout reports.

The in-app `?` panel says the same thing, so nobody has to take the pictures for
measurements.

## Controls

Pinch or scroll to magnify, drag the dial, or tap a rung. Tap the image to move
the probe; tap the centre again to release it.

`+` `−` magnify · `1`–`9` jump to a rung · `space` freeze · `f` flip camera ·
`s` capture a PNG · `p` toggle the readout · `r` recentre the probe

## Privacy

The camera stream is read into a canvas in the page and never leaves the device.
There is no upload, no analytics, and no network request after the page loads.
Without camera access — desktop, denied permission, no `getUserMedia` — it falls
back to a procedural specimen and everything else still works.

## Files

```
index.html          markup and the two overlay sheets
styles.css          instrument chrome
js/constants.js     physical constants, SI formatting, the light conversions
js/scales.js        the magnification ladder and its cross-fades
js/camera.js        camera source and the procedural fallback
js/field.js         the translation layer: camera frame → physical quantities
js/render.js        layer registry, seeded RNG, colour and element tables
js/layers/matter.js field lines, photons, cells, wavefronts, molecules
js/layers/quantum.js orbitals, nucleus, quarks, vacuum
js/hud.js           the readout
js/app.js           camera, dial, render loop, adaptive quality
```

Layers are registered by name and drawn with a weight set by the dial, so adding
a rung means adding an entry to `REGIMES` and a renderer that respects
`frame.weight`. Particle budgets scale with a measured-frame-rate quality factor;
when it drops, the molecular lattice closes its aperture and the orbital sampling
thins out rather than the frame rate falling.
