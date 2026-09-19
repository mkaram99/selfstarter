# Quantum Lens — working notes

A lens you aim at the world. It finds the object under the aperture, takes that
object's outline as the boundary of a vibrating membrane, and draws the standing
wave it would carry, with molecular-to-subnuclear structure layered into the
same silhouette.

Vanilla JS, canvas 2D, **no dependencies and no build step**. Playwright is a dev
dependency for the test harness only; the app itself never loads anything.

## Run it

```bash
npm run serve     # http://127.0.0.1:8080/
```

Use `127.0.0.1`, never a LAN address: the camera and the service worker both
require a secure context, and localhost qualifies while `http://192.168.x.x`
does not. Without a camera the app falls back to a procedural specimen, so
everything still exercises.

## Test it

```bash
npm install       # playwright, dev-only
npx playwright install chromium
npm run smoke     # walks all nine rungs, screenshots + readouts + fps
npm run smoke -- 4 5
npm run check     # controls, object detection, manifest, worker, offline
```

Both exit non-zero on failure. `smoke` writes to `tools/shots/`. If the sandbox
ships its own Chromium, point at it with `PLAYWRIGHT_CHROMIUM=/path/to/chrome`.

**Look at the screenshots.** Most of the real bugs in this thing produced a
perfectly plausible-looking wrong picture and no error at all — see *Things that
will bite you* below for the ones already paid for.

## Architecture

The pipeline is one direction, camera to canvas:

```
camera → field.js → segment.js → resonance.js → layers → canvas
         (physics)   (the object)  (the membrane)
```

| File | Does |
| --- | --- |
| `js/constants.js` | Physical constants, SI formatting, light conversions |
| `js/scales.js` | The nine-rung ladder and its cross-fades |
| `js/camera.js` | Camera source + procedural fallback, same interface |
| `js/field.js` | Camera frame → a 96×72 grid of physical quantities |
| `js/segment.js` | Finds and measures the object under the lens |
| `js/resonance.js` | Damped wave equation on that silhouette |
| `js/render.js` | Layer registry, seeded RNG, colour and element tables |
| `js/layers/cymatic.js` | The nodal figure and the harmonic line-work |
| `js/layers/matter.js` | Field lines, photons, cells, wavefronts, molecules |
| `js/layers/quantum.js` | Orbitals, nucleus, quarks, vacuum |
| `js/hud.js` | The readout |
| `js/app.js` | Lens, dial, render loop, adaptive quality |

A layer registers by name and gets `draw(ctx, frame)`. `frame.weight` is its
cross-fade from the dial and **every layer must respect it** or it will pop in
at full strength mid-transition. Adding a rung is an entry in `REGIMES` plus a
renderer.

## Things that will bite you

**Aspect-corrected coordinates.** `segment.js` and `resonance.js` work in units
where x spans `[0,1]` across the frame width and y is scaled by the same factor,
so a circle on screen is a circle in the maths. Both axes convert to device
pixels by multiplying by `view.w`. Mixing these with `v`-space (0–1 of height)
silently distorts every shape measurement.

**The dial is a frequency sweep as much as a magnification.** Further down means
shorter wavelength and more nodes. Keep both readings true of any change.

**Damping has to stay light** (`~4e-4` to `3e-3`). Heavier and the wave dies
before crossing the plate, giving a blob around the driver rather than a mode —
it looks like a rendering bug and is not one.

**Exposure comes from the plate's RMS, not its peak.** The drive points are far
hotter than the rest of the membrane; normalising to the peak makes the figure
vanish.

**The "is it ringing here" gate is at wavelength scale.** A nodal region is
wider than any pixel neighbourhood, so a tight gate erases the lines it exists
to protect and a loose one lets unreached parts of the plate blaze white.
`resonance.js` box-blurs the energy over ~λ for exactly this.

**Adaptive quality is a real contract.** `view.quality` tracks measured fps;
under load the molecular lattice closes its aperture, orbital sampling thins,
and the membrane drops to a coarser grid. New layers should degrade the same
way rather than letting frame rate fall.

**Distances are drawn to scale** and should stay that way: bond lengths, Bohr
radii screened by Slater effective charge, `1.2 fm · A^(1/3)` nuclei, the proton
at its charge radius, all at the dial's current metres-per-pixel.

## Measured vs. convention

Keep this line clean — the in-app `?` panel states it, and the whole thing rests
on not blurring it.

*Measured, then computed:* luminance → irradiance → photon flux, field
amplitude, energy density; hue → dominant wavelength → photon energy and de
Broglie length; luminance gradient → field direction; frame-to-frame change →
agitation; magnification → `Δx` and the bound `Δp ≥ ħ/2Δx`.

*Stated convention:* colour → element, pixel RGB → colour charge, and the
display clock's slowdown. A camera cannot see elements; the app says so rather
than letting the pictures pass as measurements.

*Also a stand-in:* the membrane. A real object is not a drumhead, so its
readouts are given relative to the aperture rather than as absolute frequencies.

## Known gaps

- **Never tested against a real camera** — only synthetic feeds. The object
  detection is the part most likely to disappoint in the field.
- Segmentation is region-growing on colour with an edge barrier. It finds
  *regions*, not objects, and gives up on low contrast, hard shadows and busy
  texture. `Locked on` reports `aperture (nothing separable)` when it does.
- Fold detection favours 2-fold, because most real shapes are elongated before
  they are anything else.
- Headless software rendering makes the molecular and atomic rungs the slowest;
  real hardware composites them far more cheaply.

## Conventions

ES5-style vanilla JS in an IIFE per file, hanging off one `QM` global — no
modules, no transpiler, so it runs from `file://` too. Comments explain *why*,
especially where a physical choice drives a numerical one. Two-space indent.
