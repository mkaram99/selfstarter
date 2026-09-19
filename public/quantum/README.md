# Quantum Magnifier

A lens you hold against the world. Aim it at something and it finds the object
under the aperture, takes that object's own outline as the boundary of a
vibrating membrane, and draws the standing wave it would carry — with the
structure underneath layered into the same silhouette.

Self-contained and static. No build step, no dependencies, no network at
runtime. Open `public/quantum/index.html` directly, or run the Rails app and
visit `/quantum`.

## Why a membrane

Chladni figures and electron orbitals are the same mathematics: standing waves
of a wave equation under boundary conditions, with nodes where the amplitude
stays at zero. A drumhead gives Bessel functions, a sphere gives spherical
harmonics. So the vibration figure is not decoration laid over the physics — it
is the physics, at a scale you can point a lens at.

That is also what makes the instrument a filter rather than an effect. A Chladni
pattern is a property of the *plate*: change its shape and the figure changes.
Here the plate is whatever object the aperture has found, so pointing at
something different genuinely produces a different figure, for the same reason.

## How it works

**Read the scene.** Every 1/30 s the camera frame is reduced to a 96×72 grid,
and each cell is read as physical quantities:

| Measured | Translated to |
| --- | --- |
| Luminance | Irradiance, anchored at 1 W/m² for a lit scene → photon flux, field amplitude `√(2I/cε₀)`, energy density `I/c` |
| Hue | Dominant wavelength → photon energy `hc/λ`, electron de Broglie length |
| Saturation | Spectral purity, used as a coherence proxy |
| Luminance gradient | Field direction, and the edges that stop region growth |
| Frame-to-frame change | Agitation → thermal amplitude, decoherence, membrane damping |
| Magnification | `Δx`, the real size of one screen pixel → `Δp ≥ ħ/2Δx` |

**Find the object.** A flood grows outward from the centre of the aperture,
stopped by colour difference from the running mean and by the scene's own edges,
and confined to the lens. That gives a mask, an outline as a radius-per-angle
sweep, and from the outline: area, perimeter, compactness, edge roughness, and
the object's angular symmetry as a Fourier series. The fold count of the
harmonic line-work is *measured*, never chosen — a smooth blob scores nothing
and the figure stays plain, which is the honest result. When nothing separates
from its surround, the aperture itself becomes the plate.

**Ring it.** A damped wave equation

```
u_tt + γ u_t = c² ∇²u
```

is solved by leapfrog on a grid clipped to that silhouette and driven at a
frequency the dial sets. Bright filaments are the nodes — where sand collects on
a real Chladni plate, because that is where the plate is not moving. Damping
comes from the object's motion and texture, so a still smooth surface rings
cleanly and a busy one smears. The rim arc reports how close the drive is to a
mode of this particular shape.

**The dial is a frequency sweep as much as a magnification.** Further down means
shorter wavelength, more nodes, finer structure — which is the same statement as
"higher energy states have more nodes", said twice.

## The ladder

Nine rungs, cross-faded so the descent never cuts. The structural layers are cut
to the object's silhouette rather than filling the frame.

| Rung | Field of view | What appears |
| --- | --- | --- |
| Ambient | 1 m | The fundamental, and the field overlay |
| Radiant | 1 mm | Light resolved into quanta |
| Cellular | 20 µm | The last scale that draws objects with edges |
| Wavefront | 4 µm | Light as a wave: fringes, two sources interfering |
| Molecular | 5 nm | A bond lattice at true bond length, thermally jittering |
| Atomic | 500 pm | Electron probability sampled from hydrogenic \|ψ\|² |
| Nuclear | 8 fm | Nucleons packed into `1.2 fm · A^(1/3)` |
| Partonic | 2.4 fm | Three valence quarks, colour charge, gluon flux tubes |
| Vacuum | 1 am | Virtual pairs borrowing against `ħ/2ΔE` |

## Drawn to scale, and drawn by convention

Distances are honest. Bond lengths, Bohr radii screened by the Slater effective
charge, nuclear radii at `1.2 fm · A^(1/3)`, the proton at its charge radius —
all rendered at the dial's current metres-per-pixel.

Three things are stated convention rather than measurement, because a camera
cannot see them, and the in-app `?` panel says so:

- **Colour → element.** Red reads as oxygen, blue as nitrogen, green and grey as
  carbon, white as hydrogen, yellow as sulfur, orange as phosphorus, violet as
  iron.
- **Pixel RGB → colour charge.** At the partonic rung the three channels weight
  the three colour charges.
- **Time.** Light crosses a micrometre in femtoseconds; the display clock is
  slowed by the factor the readout reports.

The membrane is a stand-in too — a real object is not a drumhead — so its
readouts are given relative to the aperture rather than dressed up as absolute
frequencies.

## Controls

Drag to aim. Pinch or scroll to sweep the dial. The aperture slider sizes the
lens.

`+` `−` sweep · `1`–`9` jump to a rung · `[` `]` aperture · `space` freeze ·
`f` flip camera · `s` capture a PNG · `p` readout · `r` recentre the lens

## Privacy

The camera stream is read into a canvas in the page and never leaves the device.
No upload, no analytics, no network request after the page loads. Without camera
access it falls back to a procedural specimen and everything still works.

## Files

```
index.html            markup and the two overlay sheets
styles.css            instrument chrome
js/constants.js       physical constants, SI formatting, light conversions
js/scales.js          the magnification ladder and its cross-fades
js/camera.js          camera source and the procedural fallback
js/field.js           camera frame → physical quantities
js/segment.js         the trigger: finds and measures the object under the lens
js/resonance.js       the membrane: damped wave equation on that silhouette
js/render.js          layer registry, seeded RNG, colour and element tables
js/layers/cymatic.js  the nodal figure and the harmonic line-work
js/layers/matter.js   field lines, photons, cells, wavefronts, molecules
js/layers/quantum.js  orbitals, nucleus, quarks, vacuum
js/hud.js             the readout
js/app.js             lens, camera, dial, render loop, adaptive quality
```

Layers register by name and draw with a weight the dial sets, so adding a rung
means an entry in `REGIMES` and a renderer that respects `frame.weight`.
Particle budgets scale with a measured-frame-rate quality factor; under load the
molecular lattice closes its aperture, orbital sampling thins out, and the
membrane drops to a coarser grid rather than the frame rate falling.
