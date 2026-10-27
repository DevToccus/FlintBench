// Tiny hyperscript. All text goes through text nodes: no innerHTML with data.

export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = [el.className, value].filter(Boolean).join(' ');
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key in el && !key.includes('-') && key !== 'list' && key !== 'form') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function replace(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// Line icons on a 24 grid with round joins and 2-unit corner radii. Each icon is a list of
// [path, part]: parts name the ink that moves when its control is engaged (v2.css); "fixed" ink
// stays put. Circles and rounded boxes are written as paths, so every part is one <path>.
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const box = (x, y, w, hh, r = 2) => `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${hh - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(hh - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
const DOC = 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z';
const FOLD = 'M14 3v4a1 1 0 0 0 1 1h4';

const ICONS = {
  home: [['M3.5 10.4 12 3.5l8.5 6.9V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z', 'house'], ['M9.5 20.5v-5.25a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5.25', 'door']],
  folder: [['M4 4.5h4.3a1.5 1.5 0 0 1 1.2.6L11 7h9a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V6A1.5 1.5 0 0 1 4 4.5z', 'fixed'], ['M2.5 11.5h19', 'flap']],
  agent: [['M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1', 'rays'], [circle(12, 12, 3), 'core']],
  activity: [['M2.5 12h3.8l2.6-7.5 6.2 15 2.6-7.5h3.8', 'trace']],
  settings: [
    [`M4 7h7.25M16.75 7H20${circle(14, 7, 2.5)}`, 'upper'],
    [`M4 17h2.25M11.75 17H20${circle(9, 17, 2.5)}`, 'lower'],
  ],
  lock: [[box(4.5, 10.5, 15, 10, 2.5), 'fixed'], ['M12 14.5v2', 'fixed'], ['M8 10.5V7.5a4 4 0 0 1 8 0v3', 'shackle']],
  terminal: [[box(2.5, 4, 19, 16, 2.5), 'fixed'], ['M7 9l3.5 3L7 15', 'caret'], ['M13 15.5h4', 'cursor']],
  branch: [['M6 3.5v11', 'fixed'], [circle(6, 17.5, 2.5), 'fixed'], [`${circle(18, 6.5, 2.5)}M18 9a9 9 0 0 1-9 9`, 'tip']],
  play: [['M7.5 5.6v12.8a1.2 1.2 0 0 0 1.8 1l10.1-6.4a1.2 1.2 0 0 0 0-2L9.3 4.6a1.2 1.2 0 0 0-1.8 1z', 'arrow', 'fill']],
  stop: [[box(5.5, 5.5, 13, 13, 2.5), 'square']],
  restart: [['M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 3.5v5h5', 'loop']],
  plus: [['M12 5v14M5 12h14', 'cross']],
  minus: [['M5 12h14', 'bar']],
  x: [['M6.5 6.5l11 11M17.5 6.5l-11 11', 'cross']],
  search: [[`${circle(10.5, 10.5, 6.5)}M20 20l-4.8-4.8`, 'lens']],
  external: [['M14.5 3.5h6v6M20.5 3.5 11.5 12.5', 'arrow'], ['M18 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5', 'fixed']],
  box: [['M20.5 8v8a1.8 1.8 0 0 1-.9 1.6l-6.7 3.8a1.8 1.8 0 0 1-1.8 0l-6.7-3.8a1.8 1.8 0 0 1-.9-1.6V8a1.8 1.8 0 0 1 .9-1.6l6.7-3.8a1.8 1.8 0 0 1 1.8 0l6.7 3.8a1.8 1.8 0 0 1 .9 1.6zM3.8 7 12 11.7 20.2 7M12 21.5v-9.8', 'crate']],
  file: [[DOC, 'sheet'], [FOLD, 'fold']],
  check: [['M4.5 12.5l5 5L19.5 7', 'tick']],
  chevron: [['M9 5.5l6.5 6.5L9 18.5', 'arrow']],
  down: [['M5.5 9l6.5 6.5L18.5 9', 'arrow']],
  up: [['M5.5 15 12 8.5l6.5 6.5', 'arrow']],
  panel: [[box(3, 4, 18, 16, 2.5), 'fixed'], ['M15 4v16', 'divider']],
  dock: [[box(3, 4, 18, 16, 2.5), 'fixed'], ['M3 14.5h18', 'shelf']],
  refresh: [['M20.5 11A8.5 8.5 0 0 0 6 6.3L3.5 8.5M3.5 3.5v5h5M3.5 13A8.5 8.5 0 0 0 18 17.7l2.5-2.2M20.5 20.5v-5h-5', 'loop']],
  resume: [['M3.5 12A8.5 8.5 0 1 0 6 6L3.5 8.5M3.5 3.5v5h5', 'loop'], ['M12 7.5V12l3 2', 'hand']],
  overview: [[box(3, 3, 7.5, 9.5, 2), 'tl'], [box(13.5, 3, 7.5, 5.5, 2), 'tr'], [box(13.5, 11.5, 7.5, 9.5, 2), 'br'], [box(3, 15.5, 7.5, 5.5, 2), 'bl']],
  workspace: [[box(3, 4, 18, 16, 2.5), 'fixed'], ['M9 4v16M9 12.5h12', 'split']],
  context: [[DOC, 'fixed'], [FOLD, 'fixed'], ['M8.5 12.5h7M8.5 16.5h4.5', 'lines']],
  work: [['M4.5 6h.01M4.5 12h.01M4.5 18h.01', 'fixed'], ['M9 6h11M9 12h11M9 18h7', 'lines']],
  editor: [['M8 7l-5 5 5 5', 'left'], ['M16 7l5 5-5 5', 'right'], ['M13.8 4.5l-3.6 15', 'fixed']],
  eye: [['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'lid'], [circle(12, 12, 2.75), 'pupil']],
  logout: [['M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5', 'fixed'], ['M15.5 16.5 20 12l-4.5-4.5M20 12H9.5', 'arrow']],
  maximize: [['M3.5 8.5v-5h5', 'tl'], ['M15.5 3.5h5v5', 'tr'], ['M20.5 15.5v5h-5', 'br'], ['M8.5 20.5h-5v-5', 'bl']],
  minimize: [['M8.5 3.5v5h-5', 'tl'], ['M20.5 8.5h-5v-5', 'tr'], ['M15.5 20.5v-5h5', 'br'], ['M3.5 15.5h5v5', 'bl']],
  trash: [['M3.5 6.5h17M9 6.5v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', 'lid'], ['M5.5 6.5l.9 12.6a1.5 1.5 0 0 0 1.5 1.4h8.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.6M10 10.5v6M14 10.5v6', 'fixed']],
  dots: [[`${circle(5.5, 12, 1.6)}${circle(12, 12, 1.6)}${circle(18.5, 12, 1.6)}`, 'dots', 'solid']],
  'st-ok': [[`${circle(12, 12, 9)}M8.2 12.3l2.6 2.6 5-5.4`, 'fixed']],
  'st-err': [[`${circle(12, 12, 9)}M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6`, 'fixed']],
  'st-warn': [['M10.3 4.2 2.8 17.5a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0zM12 9.5v4.2M12 17v.01', 'fixed']],
  'st-info': [[`${circle(12, 12, 9)}M12 11v5.3M12 7.9v.01`, 'fixed']],
  timer: [[`${circle(12, 13.5, 7.5)}M9.5 2.5h5M12 2.5V6M18.4 7.1l1.4-1.4`, 'fixed'], ['M12 13.5V9.5', 'hand']],
  download: [['M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5', 'arrow'], ['M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3', 'fixed']],
  pencil: [['M16.9 3.6a2.1 2.1 0 0 1 3 3L8 18.5l-4.5 2 2-4.5zM14.5 6l3.5 3.5', 'pen']],
  // GitHub's mark as a line icon (Lucide "github", ISC), for the rail
  github: [['M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4', 'cat'], ['M9 18c-4.51 2-5-2-7-2', 'tail']],
  commit: [[circle(12, 12, 3.5), 'node'], ['M2.5 12h6M15.5 12h6', 'fixed']],
  graph: [[`${circle(6, 6, 2.5)}${circle(18, 6, 2.5)}`, 'top'], [circle(12, 18, 2.5), 'bottom'], ['M8.5 6h7M7.2 8.2l3.6 7.6M16.8 8.2l-3.6 7.6', 'fixed']],
  bell: [['M6 9a6 6 0 0 1 12 0c0 6.2 2.5 8 2.5 8h-17S6 15.2 6 9z', 'bell'], ['M10.2 20.5a2 2 0 0 0 3.6 0', 'clapper']],
  star: [['M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z', 'star']],
  // profiles: Essentials, Builder, Pro, AI Pilot, Labs (Custom uses settings)
  leaf: [['M5 19C5 10.5 10 5 19.5 4.5 19.5 14 14 19 5 19zM5 19l8.5-8.5', 'leaf']],
  wrench: [['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z', 'wrench']],
  layers: [['M12 3.5 20.5 8 12 12.5 3.5 8z', 'top'], ['M3.5 12l8.5 4.5 8.5-4.5', 'middle'], ['M3.5 16l8.5 4.5 8.5-4.5', 'bottom']],
  sparkle: [['M10.5 3.5l1.7 4.8 4.8 1.7-4.8 1.7-1.7 4.8-1.7-4.8L4 10l4.8-1.7z', 'big'], ['M18 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z', 'small']],
  flask: [['M9.5 3.5h5M10.5 3.5v5.2L5 18.2a1.6 1.6 0 0 0 1.4 2.3h11.2a1.6 1.6 0 0 0 1.4-2.3l-5.5-9.5V3.5', 'flask'], ['M7.4 14.5h9.2', 'liquid']],
};

/** A line icon. Its stroke stays near 1.5 px on screen at every size, as if drawn for that size. */
export function icon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.dataset.icon = name;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(Math.round(Math.min(2.6, Math.max(1.75, 36 / size)) * 100) / 100));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const [d, part, paint] of ICONS[name] ?? ICONS.dots) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.dataset.iconPart = part;
    path.setAttribute('pathLength', '1'); // stroke drawing (Activity, Check) runs on a length of 1
    if (paint) path.setAttribute('fill', 'currentColor');
    if (paint === 'solid') path.setAttribute('stroke', 'none');
    svg.append(path);
  }
  return svg;
}

/**
 * The FlintBench logo (the bench with its flint and spark, app/web/brand). It fills the .brand-mark
 * tile it sits in; `size` is only its intrinsic size before CSS. Decorative: the name is next to it.
 */
export function brandMark(size = 30) {
  return h('img.brand-logo', { src: '/brand/logo-128.webp', width: size, height: size, alt: '', decoding: 'async', draggable: false });
}

/** Button that shows a busy state while its async handler runs. */
export function actionButton(label, handler, { cls = 'btn', iconName, title, disabled } = {}) {
  const btn = h(`button.${cls.split(' ').join('.')}`, { type: 'button', title, disabled, 'aria-label': title && !label ? title : undefined });
  if (iconName) btn.append(icon(iconName, 14));
  if (label) btn.append(label);
  btn.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (btn.classList.contains('busy')) return;
    btn.classList.add('busy');
    btn.setAttribute('aria-busy', 'true');
    try {
      await handler(event);
    } finally {
      btn.classList.remove('busy');
      btn.removeAttribute('aria-busy');
    }
  });
  return btn;
}
