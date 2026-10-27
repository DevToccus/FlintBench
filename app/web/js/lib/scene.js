// The background scene: a looping video behind the console (app/web/media), shown through a scrim
// of the canvas colour. Blue hour: a city skyline across a calm river just after sunset. Night sky:
// clouds drifting over a town at dusk, in time-lapse. Fireworks: New Year's fireworks over Dubai.
// Red and blue: soft red and blue geometric shapes on black. All from Pexels, free licence: see
// app/web/media/README.md. It plays muted and pauses on its current frame when motion is off,
// when the system asks for reduced motion, and while FlintBench is not on screen.

/** A scene's video (WebM first, MP4 where WebM is not played) and a still for the picker. */
const media = (id) => ({ sources: [[`/media/${id}.webm`, 'video/webm'], [`/media/${id}.mp4`, 'video/mp4']], poster: `/media/${id}.jpg` });
const MEDIA = Object.fromEntries(['blue-hour', 'night-sky', 'fireworks', 'geometric'].map((id) => [id, media(id)]));

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let layer = null;
let video = null;
let moving = true;

function sync() {
  if (!video) return;
  if (moving && !reducedMotion.matches && !document.hidden) video.play().catch(() => { /* not allowed yet: the poster stays */ });
  else video.pause();
}
reducedMotion.addEventListener('change', sync);
document.addEventListener('visibilitychange', sync);

/** Shows the scene (or none) behind everything, with its motion and blur (px). */
export function applyScene({ scene = 'none', motion = true, blur = 0 } = {}) {
  const root = document.documentElement.style;
  const set = (name, value) => { if (root.getPropertyValue(name) !== value) root.setProperty(name, value); };
  set('--scene-blur', `${blur}px`);
  // a blurred picture is scaled up a little so its soft edges stay outside the window
  set('--scene-zoom', String(1 + blur * 0.006));
  moving = motion;
  const media = MEDIA[scene];
  if (!media) {
    layer?.remove();
    layer = video = null;
    return;
  }
  if (layer?.dataset.scene !== scene) {
    layer?.remove();
    video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto', poster: media.poster, disablePictureInPicture: true });
    video.setAttribute('aria-hidden', 'true');
    for (const [src, type] of media.sources) {
      const source = document.createElement('source');
      Object.assign(source, { src, type });
      video.append(source);
    }
    layer = document.createElement('div');
    layer.className = 'scene';
    layer.dataset.scene = scene;
    layer.append(video);
    document.body.prepend(layer);
  }
  sync();
}

/** A still of the scene for the picker in Settings. */
export function sceneThumbnail(scene) {
  const media = MEDIA[scene];
  if (!media) return null;
  const img = document.createElement('img');
  Object.assign(img, { src: media.poster, alt: '', decoding: 'async', loading: 'lazy', draggable: false });
  return img;
}
