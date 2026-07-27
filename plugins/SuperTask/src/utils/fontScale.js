/**
 * App-wide accessibility text scale (F-031).
 *
 * StyleSheets are created once at module load, so scaled font sizes are
 * applied as inline overrides at render time: components call useFontScale()
 * and multiply their base sizes. config.js pushes the saved value through
 * setFontScale() on every load/save (same cycle-free direction as the debug
 * server URL), so changing it in Settings re-renders subscribers immediately.
 */

/**
 * Supported steps (F-035). Stored as multipliers, presented as percentages
 * (Windows-style display scaling) rather than Default/Large/Extra Large.
 * There is no honest literal px label: the scale multiplies every base size
 * in the app, and those differ per element (chips 12px, titles 22px).
 *
 * Capped at 1.3 -- the largest scale F-031 was laid out and tested against.
 * Adding 1.4/1.5 is a one-line change once chip wrapping is confirmed on-device.
 */
export const FONT_SCALE_STEPS = [1, 1.1, 1.2, 1.3];

/**
 * Snap a stored scale to the nearest supported step. Legacy configs hold 1.15
 * (the old "Large"), which matches no step -- and a Segmented whose value
 * matches no option renders with NOTHING selected. Ties round up: this is an
 * accessibility control, so never silently shrink a user's text.
 */
export function normalizeFontScale(value) {
  const v = Number(value);
  if (!v || v < 0.8 || v > 2) return 1;
  // Compare in integer percent: 1.15 is equidistant from 1.1 and 1.2 in
  // decimal, but NOT in binary floating point (|1.2-1.15| > |1.1-1.15|), so a
  // direct <= comparison silently rounds the old "Large" DOWN -- the one case
  // this function exists for. Integer percent makes the tie a real tie.
  const pct = Math.round(v * 100);
  return FONT_SCALE_STEPS.reduce(
    (best, step) =>
      Math.abs(Math.round(step * 100) - pct) <= Math.abs(Math.round(best * 100) - pct)
        ? step
        : best,
    FONT_SCALE_STEPS[0],
  );
}

let _scale = 1;
const _listeners = new Set();

export function setFontScale(scale) {
  const s = Number(scale);
  if (!s || s === _scale || s < 0.8 || s > 2) return;
  _scale = s;
  _listeners.forEach(l => {
    try {
      l(s);
    } catch {}
  });
}

export function getFontScale() {
  return _scale;
}

export function subscribeFontScale(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
