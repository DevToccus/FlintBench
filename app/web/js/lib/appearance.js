// Appearance choices that are yours (not the profile's): colour theme, background scene, its motion
// and blur, and how much of it shows through bars and containers. Shared with the server, which
// validates them (app/server/settings/service.js), so no browser API here.

/** Colour themes: [id, name, swatch for the picker: canvas, surface]. The tokens live in v2.css. */
export const PALETTES = [
  ['graphite', 'Graphite', '#101318', '#202731'],
  ['blue-hour', 'Blue hour', '#0a1428', '#1a2b4b'],
  ['pine', 'Pine', '#0b1512', '#1b2c26'],
  ['dusk', 'Dusk', '#130f1c', '#261e36'],
  ['ember', 'Ember', '#16110e', '#2b211b'],
  ['carbon', 'Carbon', '#050506', '#17181b'],
];
export const PALETTE_IDS = PALETTES.map(([id]) => id);

export const SCENES = [['none', 'None'], ['blue-hour', 'Blue hour']];
export const SCENE_IDS = SCENES.map(([id]) => id);

/** Background blur, whole px: [min, max]. Past 40 the picture is only colour. */
export const BLUR_RANGE = [0, 40];

/** Transparency of bars and containers, whole percent: [min, max]. Past 60 text loses its ground. */
export const TRANSPARENCY_RANGE = [0, 60];

/** Size of text and of the interface with it, relative to the designed size: [min, max], in hundredths. */
export const UI_SCALE_RANGE = [0.75, 1.5];

/** A whole number within [min, max]. */
export const inRange = (v, [min, max]) => Number.isInteger(v) && v >= min && v <= max;

/** A UI scale within its range, in whole percent (1.1, 0.95, 1.37). */
export const isUiScale = (v) => typeof v === 'number' && v >= UI_SCALE_RANGE[0] && v <= UI_SCALE_RANGE[1] && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

export const DEFAULT_APPEARANCE = { palette: 'graphite', scene: 'none', sceneMotion: true, sceneBlur: 0, transparency: 0 };

/** Any stored or staged value, read as a complete and valid appearance. */
export function normalizeAppearance(a = {}) {
  const d = DEFAULT_APPEARANCE;
  return {
    palette: PALETTE_IDS.includes(a?.palette) ? a.palette : d.palette,
    scene: SCENE_IDS.includes(a?.scene) ? a.scene : d.scene,
    sceneMotion: typeof a?.sceneMotion === 'boolean' ? a.sceneMotion : d.sceneMotion,
    sceneBlur: inRange(a?.sceneBlur, BLUR_RANGE) ? a.sceneBlur : d.sceneBlur,
    transparency: inRange(a?.transparency, TRANSPARENCY_RANGE) ? a.transparency : d.transparency,
  };
}
