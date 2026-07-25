/**
 * App-wide accessibility text scale (F-031).
 *
 * StyleSheets are created once at module load, so scaled font sizes are
 * applied as inline overrides at render time: components call useFontScale()
 * and multiply their base sizes. config.js pushes the saved value through
 * setFontScale() on every load/save (same cycle-free direction as the debug
 * server URL), so changing it in Settings re-renders subscribers immediately.
 */

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
