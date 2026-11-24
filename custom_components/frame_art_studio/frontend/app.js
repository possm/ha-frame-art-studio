'use strict';

const width = 3840;
const height = 2160;
const STORAGE_KEY = 'the-frame-generator:v13';
const LEGACY_STORAGE_KEY = 'the-frame-generator:v12';

const get = id => document.getElementById(id);
const preview = get('preview');
const images = { art: null, texture: null, shadow: null };
const slidersMeta = new Map();

let artVersion = 0;
let currentArtFilename = '';
let compareOriginal = false;
let activeProfile = 'evening';

const PROFILE_LABELS = {
  day: 'Dag',
  evening: 'Avond'
};

const SHARED_DEFAULTS = {
  fitMode: 'cover',
  matColor: '#f8f6f0',
  zoom: 100,
  panX: 0,
  panY: 0,
  matX: 5,
  matY: 8,
  bevel: 8,
  grain: 18,
  depth: 85,
  shade: 40,
  rotation: 0,
  shadowBlur: 24
};

const LIGHT_PRESETS = {
  evening: {
    angle: 270,
    ledColor: '#fff6cb',
    shadowColor: '#6e5f2c',
    ledStrength: 100,
    shadowDepth: 84,
    ledReach: 22,
    ledSoftness: 36,
    screenDim: 4,
    paperLook: 45,
    artLight: 100,
    matTopShadow: 44
  },
  darkRoom: {
    angle: 270,
    ledColor: '#fff1be',
    shadowColor: '#66521e',
    ledStrength: 100,
    shadowDepth: 96,
    ledReach: 20,
    ledSoftness: 32,
    screenDim: 2,
    paperLook: 55,
    artLight: 100,
    matTopShadow: 52
  },
  daylight: {
    angle: 180,
    ledColor: '#dbf0e7',
    shadowColor: '#a6bab1',
    ledStrength: 92,
    shadowDepth: 24,
    ledReach: 60,
    ledSoftness: 50,
    screenDim: 20,
    paperLook: 45,
    artLight: 100,
    matTopShadow: 34
  },
  neutral: {
    angle: 180,
    ledColor: '#fffdf7',
    shadowColor: '#c4b69f',
    ledStrength: 0,
    shadowDepth: 0,
    ledReach: 50,
    ledSoftness: 50,
    screenDim: 0,
    paperLook: 0,
    artLight: 100,
    matTopShadow: 8
  }
};

const PROFILE_KEYS = new Set(Object.keys(LIGHT_PRESETS.evening));

const shared = { ...SHARED_DEFAULTS };
const profiles = {
  day: { ...LIGHT_PRESETS.daylight, preset: 'daylight' },
  evening: { ...LIGHT_PRESETS.darkRoom, preset: 'darkRoom' }
};

function directionWord(angleDeg) {
  const norm = ((angleDeg % 360) + 360) % 360;
  if (norm >= 338 || norm < 23) return 'rechts';
  if (norm < 68) return 'rechtsonder';
  if (norm < 113) return 'onder';
  if (norm < 158) return 'linksonder';
  if (norm < 203) return 'links';
  if (norm < 248) return 'linksboven';
  if (norm < 293) return 'boven';
  return 'rechtsboven';
}

function oppositeDirectionWord(angleDeg) {
  return directionWord(angleDeg + 180);
}

const formatValue = (value, unit, id) => {
  if (id === 'angle') return `${value}° (${directionWord(Number(value))})`;
  return unit === '%' || unit === '°' ? value + unit : value + ' ' + unit;
};

function syncSliderVars(input) {
  input.style.setProperty('--attr-min', input.min || '0');
  input.style.setProperty('--attr-max', input.max || '100');
  input.style.setProperty('--control-value', input.value);
}

function getParam(id, profileName = activeProfile) {
  return PROFILE_KEYS.has(id) ? profiles[profileName][id] : shared[id];
}

function setParam(id, value, profileName = activeProfile) {
  if (PROFILE_KEYS.has(id)) {
    profiles[profileName][id] = value;
  } else {
    shared[id] = value;
  }
}

function updateSliderUI(id, value) {
  const meta = slidersMeta.get(id);
  if (!meta) return;
  const clamped = Math.min(meta.max, Math.max(meta.min, Math.round(value)));
  meta.input.value = String(clamped);
  const formatted = formatValue(clamped, meta.unit, id);
  meta.output.textContent = formatted;
  meta.input.setAttribute('aria-valuetext', formatted);
  syncSliderVars(meta.input);
  return clamped;
}

function setSlider(id, value, silent = false) {
  const clamped = updateSliderUI(id, value);
  if (clamped === undefined) return;
  setParam(id, clamped);
  if (!silent) {
    saveState();
    refresh();
  }
}

function addSliders(group, sliders) {
  const container = get(group);
  for (const [id, title, min, max, initial, unit] of sliders) {
    const row = document.createElement('div');
    const header = document.createElement('div');
    header.className = 'range-label';
    const label = document.createElement('label');
    const output = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';

    label.htmlFor = input.id = id;
    label.textContent = title;
    output.htmlFor.add(id);
    Object.assign(input, { min: String(min), max: String(max), value: String(initial) });

    slidersMeta.set(id, { input, output, min, max, unit });
    updateSliderUI(id, initial);

    input.addEventListener('input', () => {
      const next = Number(input.value);
      setParam(id, next);
      updateSliderUI(id, next);
      if (PROFILE_KEYS.has(id)) {
        profiles[activeProfile].preset = null;
        syncPresetButtons();
      }
      saveState();
      refresh();
    });

    header.append(label, output);
    row.append(header, input);
    container.append(row);
  }
}

addSliders('artControls', [
  ['zoom', 'Vergroting', 100, 300, SHARED_DEFAULTS.zoom, '%'],
  ['panX', 'Uitsnede horizontaal', -100, 100, SHARED_DEFAULTS.panX, '%'],
  ['panY', 'Uitsnede verticaal', -100, 100, SHARED_DEFAULTS.panY, '%']
]);
addSliders('ledControls', [
  ['angle', 'Lichtrichting', 0, 360, LIGHT_PRESETS.darkRoom.angle, '°'],
  ['ledStrength', 'Sterkte lichtverloop', 0, 100, LIGHT_PRESETS.darkRoom.ledStrength, '%'],
  ['shadowDepth', 'Donkerte schaduwkant', 0, 100, LIGHT_PRESETS.darkRoom.shadowDepth, '%'],
  ['ledReach', 'Reikwijdte lichtbron', 10, 100, LIGHT_PRESETS.darkRoom.ledReach, '%'],
  ['ledSoftness', 'Zachtheid verloop', 0, 100, LIGHT_PRESETS.darkRoom.ledSoftness, '%'],
  ['screenDim', 'Scherm-dimming (hele beeld)', 0, 50, LIGHT_PRESETS.darkRoom.screenDim, '%'],
  ['paperLook', 'Mat-papier look (kunstwerk)', 0, 100, LIGHT_PRESETS.darkRoom.paperLook, '%'],
  ['artLight', 'Lichtval op kunstwerk', 0, 100, LIGHT_PRESETS.darkRoom.artLight, '%'],
  ['matTopShadow', 'Lijstschaduw bovenrand', 0, 100, LIGHT_PRESETS.darkRoom.matTopShadow, '%']
]);
addSliders('matControls', [
  ['matX', 'Karton links en rechts', 0, 35, SHARED_DEFAULTS.matX, '%'],
  ['matY', 'Karton boven en onder', 0, 35, SHARED_DEFAULTS.matY, '%'],
  ['bevel', 'Schuine snede', 0, 16, SHARED_DEFAULTS.bevel, 'px']
]);
addSliders('textureControls', [
  ['grain', 'Dekking kartontextuur', 0, 100, SHARED_DEFAULTS.grain, '%']
]);
addSliders('lightControls', [
  ['depth', 'Slagschaduw op kunstwerk', 0, 100, SHARED_DEFAULTS.depth, '%']
]);
addSliders('shadowControls', [
  ['shade', 'Dekking extra overlay', 0, 100, SHARED_DEFAULTS.shade, '%'],
  ['rotation', 'Draaiing overlay', -180, 180, SHARED_DEFAULTS.rotation, '°'],
  ['shadowBlur', 'Vervaging overlay', 0, 160, SHARED_DEFAULTS.shadowBlur, 'px']
]);

function hexToSrgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255
  ];
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  const clamped = Math.min(1, Math.max(0, c));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * (clamped ** (1 / 2.4)) - 0.055;
}

function srgbToHex(rgb) {
  return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}

function makeGrain() {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 512;
  const ctx = tile.getContext('2d');
  const data = ctx.createImageData(tile.width, tile.height);
  let seed = 12345;
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const tone = 198 + (seed >>> 25) * 0.44;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = tone;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return tile;
}

const grain = makeGrain();

// Cached matte-paper artwork buffer so lighting/dimming slider drags stay instant
const paperBuffer = document.createElement('canvas');
const paperBufferCtx = paperBuffer.getContext('2d', { willReadFrequently: true });
let paperBufferKey = '';

// Cached multi-step halving mipmap pyramid for the active artwork.
// Prevents Canvas 2D single-step downscaling aliasing on large 20-60 MP photos.
let artMipmaps = [];
let artMipmapVersion = -1;

function getMipmapSource(img, targetW, targetH) {
  if (img !== images.art) return img;
  if (artMipmapVersion !== artVersion) {
    artMipmapVersion = artVersion;
    artMipmaps = [img];
  }
  let best = artMipmaps[0];
  while (best.width >= targetW * 2 && best.height >= targetH * 2 && best.width > 512 && best.height > 512) {
    const nextIdx = artMipmaps.indexOf(best) + 1;
    if (nextIdx < artMipmaps.length) {
      best = artMipmaps[nextIdx];
      continue;
    }
    const half = document.createElement('canvas');
    half.width = Math.max(1, Math.round(best.width / 2));
    half.height = Math.max(1, Math.round(best.height / 2));
    const hctx = half.getContext('2d');
    hctx.imageSmoothingEnabled = true;
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(best, 0, 0, half.width, half.height);
    artMipmaps.push(half);
    best = half;
  }
  return best;
}

function getLightFieldParams(profile) {
  const ledSrgb = hexToSrgb(profile.ledColor);
  const shdSrgb = hexToSrgb(profile.shadowColor);
  const depth = profile.shadowDepth / 100;
  const reach = Math.max(0.08, profile.ledReach / 100);
  const exponent = 0.9 + (profile.ledSoftness / 100) * 1.5;

  const bottomSrgb = [
    ledSrgb[0] * (1 - depth) + shdSrgb[0] * depth,
    ledSrgb[1] * (1 - depth) + shdSrgb[1] * depth,
    ledSrgb[2] * (1 - depth) + shdSrgb[2] * depth
  ];
  return {
    topLin: ledSrgb.map(srgbToLinear),
    bottomLin: bottomSrgb.map(srgbToLinear),
    reach,
    exponent
  };
}

function sampleLightSrgbAt(t, params) {
  const { topLin, bottomLin, reach, exponent } = params;
  // Normalized line-source falloff so f(0)=1 at the light edge and f(1)=0 at the shadow edge
  const f1 = 1 / (1 + (1 / reach) ** exponent);
  const raw = 1 / (1 + (t / reach) ** exponent);
  const falloff = (raw - f1) / (1 - f1);
  return [
    linearToSrgb(bottomLin[0] + (topLin[0] - bottomLin[0]) * falloff),
    linearToSrgb(bottomLin[1] + (topLin[1] - bottomLin[1]) * falloff),
    linearToSrgb(bottomLin[2] + (topLin[2] - bottomLin[2]) * falloff)
  ];
}

function buildDirectionalLightGradient(ctx, profile, lightX, lightY, effectiveStrength, dimFactor) {
  const params = getLightFieldParams(profile);
  // Falloff runs opposite to light-source direction: (-lightX, -lightY)
  // e.g. angle=270° -> top to bottom; angle=180° -> left to right
  const ux = -lightX;
  const uy = -lightY;
  const halfExtent = (width / 2) * Math.abs(ux) + (height / 2) * Math.abs(uy);
  const x0 = width / 2 - ux * halfExtent;
  const y0 = height / 2 - uy * halfExtent;
  const x1 = width / 2 + ux * halfExtent;
  const y1 = height / 2 + uy * halfExtent;

  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  const stops = 64;
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    const light = sampleLightSrgbAt(t, params);
    // Combine lighting strength AND screen dimming into a single multiply pass
    // to prevent double 8-bit quantization artifacts in dark shadows
    const combined = [
      (1 - effectiveStrength + effectiveStrength * light[0]) * dimFactor,
      (1 - effectiveStrength + effectiveStrength * light[1]) * dimFactor,
      (1 - effectiveStrength + effectiveStrength * light[2]) * dimFactor
    ];
    grad.addColorStop(t, srgbToHex(combined));
  }
  return grad;
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function updateRampPreview() {
  const profile = profiles[activeProfile];
  const matSrgb = hexToSrgb(shared.matColor);
  const params = getLightFieldParams(profile);
  const strength = compareOriginal ? 0 : profile.ledStrength / 100;
  const dimFactor = compareOriginal ? 1 : 1 - profile.screenDim / 100;

  const fromDir = directionWord(profile.angle);
  const toDir = oppositeDirectionWord(profile.angle);
  const lightKind = activeProfile === 'day' ? 'daglicht' : 'ledbalk';
  get('rampStartLabel').textContent = `${capitalize(fromDir)} (${lightKind})`;
  get('rampEndLabel').textContent = `${capitalize(toDir)} (schaduw)`;
  get('ledColorLabel').textContent = `Lichtkleur (${fromDir})`;
  get('shadowColorLabel').textContent = `Kleur donkere deel (${toDir})`;

  const sampleAt = t => {
    const light = sampleLightSrgbAt(t, params);
    return [
      matSrgb[0] * (1 - strength + strength * light[0]) * dimFactor,
      matSrgb[1] * (1 - strength + strength * light[1]) * dimFactor,
      matSrgb[2] * (1 - strength + strength * light[2]) * dimFactor
    ];
  };

  const stops = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    stops.push(`${srgbToHex(sampleAt(t))} ${Math.round(t * 100)}%`);
  }
  get('lightRamp').style.background = `linear-gradient(to right, ${stops.join(', ')})`;

  const linearPct = Math.round((dimFactor ** 2.2) * 100);
  get('dimSummary').textContent = compareOriginal
    ? 'Licht uit (vergelijk)'
    : `Schermlicht ~${linearPct}%`;

  const topHex = srgbToHex(sampleAt(0));
  const midHex = srgbToHex(sampleAt(0.5));
  const botHex = srgbToHex(sampleAt(1));
  get('rampHex').textContent = '';
  for (const hex of [topHex, midHex, botHex]) {
    const span = document.createElement('span');
    span.textContent = hex.toUpperCase();
    get('rampHex').append(span);
  }
}

function drawArtworkImage(ctx, img, x, y, w, h, zoom = 1, panX = 0, panY = 0, mode = 'cover', pixelScale = 1) {
  const baseScale = mode === 'contain'
    ? Math.min(w / img.width, h / img.height)
    : Math.max(w / img.width, h / img.height);
  const scale = baseScale * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const source = getMipmapSource(img, dw * pixelScale, dh * pixelScale);
  ctx.drawImage(source, x + (w - dw) * (1 + panX) / 2, y + (h - dh) * (1 + panY) / 2, dw, dh);
}

function sampleArt(ctx, x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 1000, h / 600);
  const sky = ctx.createLinearGradient(0, 0, 0, 600);
  sky.addColorStop(0, '#b7c0a7');
  sky.addColorStop(1, '#efe0b3');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1000, 600);
  ctx.fillStyle = '#f3cf8e';
  ctx.beginPath();
  ctx.arc(728, 158, 68, 0, Math.PI * 2);
  ctx.fill();
  const hills = [
    ['#918d74', 310, 125, 390, 360, 600, 265],
    ['#686f5b', 350, 435, 425, 610, 160, 360],
    ['#46564d', 440, 220, 310, 720, 530, 399],
    ['#283e38', 480, 385, 610, 745, 355, 469]
  ];
  for (const [color, left, x1, y1, x2, y2, right] of hills) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, left);
    ctx.bezierCurveTo(x1, y1, x2, y2, 1000, right);
    ctx.lineTo(1000, 600);
    ctx.lineTo(0, 600);
    ctx.fill();
  }
  ctx.restore();
}

// Matte fine-art paper print simulation on artwork:
// 1) gentle saturation softening, 2) smooth highlight shoulder roll-off, 3) subtle warm paper black lift
function applyMattePaperLook(imageData, strength) {
  const data = imageData.data;
  const sat = 1 - 0.16 * strength;
  const knee = 0.65;
  const invKneeRange = 1 / (1 - knee);
  const ceilingDrop = 0.16 * strength;
  const liftR = 0.042 * strength;
  const liftG = 0.036 * strength;
  const liftB = 0.028 * strength;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Soften saturation toward pigment-ink range
    r = luma + (r - luma) * sat;
    g = luma + (g - luma) * sat;
    b = luma + (b - luma) * sat;

    // Smooth C1 highlight roll-off so snow/lights never glow brighter than illuminated cardboard
    const maxVal = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (maxVal > knee) {
      const over = (maxVal - knee) * invKneeRange;
      const outMax = knee + (1 - knee) * over - ceilingDrop * over * over;
      const scale = outMax / maxVal;
      r *= scale;
      g *= scale;
      b *= scale;
    }

    // Subtle warm paper black-point lift so shadows stay open under evening dimming
    const invL = 1 - luma;
    const shadowWeight = invL * invL * Math.sqrt(invL > 0 ? invL : 0);
    r += liftR * shadowWeight;
    g += liftG * shadowWeight;
    b += liftB * shadowWeight;

    data[i] = r <= 0 ? 0 : r >= 1 ? 255 : Math.round(r * 255);
    data[i + 1] = g <= 0 ? 0 : g >= 1 ? 255 : Math.round(g * 255);
    data[i + 2] = b <= 0 ? 0 : b >= 1 ? 255 : Math.round(b * 255);
  }
}

function drawPreparedArtwork(ctx, canvas, x, y, w, h, paperLookStrength) {
  const zoom = shared.zoom / 100;
  const panX = shared.panX / 100;
  const panY = shared.panY / 100;
  const fitMode = shared.fitMode;

  const paintRaw = (targetCtx, tx, ty, tw, th, pScale) => {
    targetCtx.fillStyle = shared.matColor;
    targetCtx.fillRect(tx, ty, tw, th);
    if (images.art) {
      drawArtworkImage(targetCtx, images.art, tx, ty, tw, th, zoom, panX, panY, fitMode, pScale);
    } else {
      const expansion = zoom - 1;
      sampleArt(
        targetCtx,
        tx - tw * expansion * (1 + panX) / 2,
        ty - th * expansion * (1 + panY) / 2,
        tw * zoom,
        th * zoom
      );
    }
  };

  const scaleX = canvas.width / width;
  const scaleY = canvas.height / height;

  if (paperLookStrength <= 0.001) {
    paintRaw(ctx, x, y, w, h, Math.max(scaleX, scaleY));
    return;
  }

  const bw = Math.max(1, Math.round(w * scaleX));
  const bh = Math.max(1, Math.round(h * scaleY));
  const key = `${artVersion}|${shared.matColor}|${fitMode}|${shared.zoom}|${shared.panX}|${shared.panY}|${bw}x${bh}|${paperLookStrength.toFixed(3)}`;

  if (key !== paperBufferKey) {
    paperBufferKey = key;
    if (paperBuffer.width !== bw || paperBuffer.height !== bh) {
      paperBuffer.width = bw;
      paperBuffer.height = bh;
    }
    paperBufferCtx.imageSmoothingEnabled = true;
    paperBufferCtx.imageSmoothingQuality = 'high';
    paintRaw(paperBufferCtx, 0, 0, bw, bh, 1);
    const imgData = paperBufferCtx.getImageData(0, 0, bw, bh);
    applyMattePaperLook(imgData, paperLookStrength);
    paperBufferCtx.putImageData(imgData, 0, 0);
  }

  ctx.drawImage(paperBuffer, x, y, w, h);
}

function drawMat(ctx, x, y, w, h) {
  const fill = () => {
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(x, y, w, h);
    ctx.fill('evenodd');
  };
  ctx.fillStyle = shared.matColor;
  fill();
  if (shared.grain) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = shared.grain / 100;
    ctx.fillStyle = ctx.createPattern(images.texture || grain, 'repeat');
    fill();
    ctx.restore();
  }
}

function drawInnerMatShadow(ctx, x, y, w, h, lightX, lightY) {
  if (!shared.depth || (!x && !y)) return;
  const depthFactor = shared.depth / 100;
  const sides = [
    { x0: x, y0: y, dx: 1, dy: 0, len: w, nx: 0, ny: 1, light: lightY, active: y > 0 },
    { x0: x + w, y0: y, dx: 0, dy: 1, len: h, nx: -1, ny: 0, light: -lightX, active: x > 0 },
    { x0: x + w, y0: y + h, dx: -1, dy: 0, len: w, nx: 0, ny: -1, light: -lightY, active: y > 0 },
    { x0: x, y0: y + h, dx: 0, dy: -1, len: h, nx: 1, ny: 0, light: lightX, active: x > 0 }
  ];

  const spreads = sides.map(s => s.active ? Math.min(Math.min(w, h) / 2, 14 + Math.max(0, -s.light) * 32) : 0);

  for (let i = 0; i < 4; i++) {
    const s = sides[i];
    const spread = spreads[i];
    if (!spread) continue;
    const prevSpread = spreads[(i + 3) % 4];
    const nextSpread = spreads[(i + 1) % 4];

    const alphaMax = depthFactor * (0.18 + Math.max(0, -s.light) * 0.48);
    const grad = ctx.createLinearGradient(s.x0, s.y0, s.x0 + s.nx * spread, s.y0 + s.ny * spread);
    grad.addColorStop(0, `rgba(26,18,10,${alphaMax.toFixed(3)})`);
    grad.addColorStop(0.22, `rgba(26,18,10,${(alphaMax * 0.48).toFixed(3)})`);
    grad.addColorStop(0.58, `rgba(26,18,10,${(alphaMax * 0.14).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(26,18,10,0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x0 + s.dx * s.len, s.y0 + s.dy * s.len);
    ctx.lineTo(
      s.x0 + s.dx * (s.len - nextSpread) + s.nx * spread,
      s.y0 + s.dy * (s.len - nextSpread) + s.ny * spread
    );
    ctx.lineTo(
      s.x0 + s.dx * prevSpread + s.nx * spread,
      s.y0 + s.dy * prevSpread + s.ny * spread
    );
    ctx.closePath();
    ctx.fill();
  }
}

function drawBevel(ctx, x, y, w, h, lightX, lightY, profile, mode = 'all') {
  if (!shared.bevel || (!x && !y)) return;
  const sides = [
    [x, y, 1, 0, w, lightY],
    [x + w, y, 0, 1, h, -lightX],
    [x + w, y + h, -1, 0, w, -lightY],
    [x, y + h, 0, -1, h, lightX]
  ];
  const dimFactor = mode === 'highlight' ? Math.max(0.4, 1 - profile.screenDim / 100) : 1;
  const ledRgb = hexToSrgb(profile.ledColor).map(v => Math.round(v * dimFactor * 255));
  const ledFactor = profile.ledStrength / 100;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.rect(x, y, w, h);
  ctx.clip('evenodd');

  for (const [sx, sy, dx, dy, length, light] of sides) {
    const margin = dx ? y : x;
    if (!margin) continue;
    const edge = Math.min(shared.bevel, margin);

    if (mode === 'shadow' && light > 0) continue;
    if (mode === 'highlight' && light <= 0) continue;

    if (light > 0) {
      // 45° cut white paper-core bevel tilts directly toward the light source,
      // catching bright light even along the darker bottom/far side of the matte
      const alpha = mode === 'highlight'
        ? light * (0.28 + 0.28 * ledFactor)
        : light * 0.55;
      ctx.fillStyle = mode === 'highlight'
        ? `rgba(${ledRgb[0]},${ledRgb[1]},${ledRgb[2]},${alpha.toFixed(3)})`
        : `rgba(255,252,244,${alpha.toFixed(3)})`;
    } else {
      ctx.fillStyle = `rgba(28,20,11,${(0.08 + -light * 0.34).toFixed(3)})`;
    }

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + dx * length, sy + dy * length);
    ctx.lineTo(sx + dx * (length + edge) + dy * edge, sy + dy * (length + edge) - dx * edge);
    ctx.lineTo(sx - dx * edge + dy * edge, sy - dy * edge - dx * edge);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawRoomLighting(ctx, x, y, w, h, profile, lightX, lightY) {
  const strength = profile.ledStrength / 100;
  const dimFactor = Math.max(0.4, 1 - profile.screenDim / 100);
  if (strength <= 0 && dimFactor >= 0.999) return;

  const artFactor = profile.artLight / 100;

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  if (artFactor >= 0.999 || (!x && !y)) {
    const effStrength = strength * (x || y ? 1 : artFactor);
    ctx.fillStyle = buildDirectionalLightGradient(ctx, profile, lightX, lightY, effStrength, dimFactor);
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(x, y, w, h);
    ctx.clip('evenodd');
    ctx.fillStyle = buildDirectionalLightGradient(ctx, profile, lightX, lightY, strength, dimFactor);
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = buildDirectionalLightGradient(ctx, profile, lightX, lightY, strength * artFactor, dimFactor);
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  ctx.restore();
}

function drawBezelShadows(ctx, profile, lightX, lightY) {
  if (!profile.matTopShadow) return;
  const strength = profile.matTopShadow / 100;

  // Recessed frame bezel cast shadows:
  // Top edge ALWAYS receives a realistic overhanging frame/cabinet shadow (strongest under overhead LED at 270°),
  // while side edges add directional recessed depth (e.g. left frame shadow in daylight from 180°).
  const topWeight = Math.max(0.55, Math.max(0, -lightY));
  const edges = [
    { weight: topWeight, isTop: true, x0: 0, y0: 0, dx: 0, dy: 1, rx: 0, ry: 0, rw: width, rh: 0 },
    { weight: Math.max(0, lightX) * 0.78, isTop: false, x0: width, y0: 0, dx: -1, dy: 0, rx: width, ry: 0, rw: 0, rh: height },
    { weight: Math.max(0, lightY) * 0.55, isTop: false, x0: 0, y0: height, dx: 0, dy: -1, rx: 0, ry: height, rw: width, rh: 0 },
    { weight: Math.max(0, -lightX) * 0.78, isTop: false, x0: 0, y0: 0, dx: 1, dy: 0, rx: 0, ry: 0, rw: 0, rh: height }
  ];

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (const e of edges) {
    const reach = e.isTop
      ? Math.round((68 + strength * 96) * (0.72 + 0.28 * e.weight))
      : Math.round(18 + e.weight * (54 + strength * 58));
    const alpha = e.isTop
      ? strength * e.weight * 0.92
      : strength * (0.14 + e.weight * 0.68);
    if (alpha < 0.015) continue;

    const grad = ctx.createLinearGradient(e.x0, e.y0, e.x0 + e.dx * reach, e.y0 + e.dy * reach);
    // Tight contact umbra right under the frame bezel lip + smooth recessed penumbra
    grad.addColorStop(0, `rgba(26,18,10,${Math.min(0.88, alpha).toFixed(3)})`);
    grad.addColorStop(0.18, `rgba(26,18,10,${(alpha * 0.56).toFixed(3)})`);
    grad.addColorStop(0.45, `rgba(26,18,10,${(alpha * 0.22).toFixed(3)})`);
    grad.addColorStop(0.75, `rgba(26,18,10,${(alpha * 0.06).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(26,18,10,0)');

    ctx.fillStyle = grad;
    const rx = e.dx < 0 ? width - reach : e.rx;
    const ry = e.dy < 0 ? height - reach : e.ry;
    const rw = e.rw || reach;
    const rh = e.rh || reach;
    ctx.fillRect(rx, ry, rw, rh);
  }
  ctx.restore();
}

function drawExtraShadowOverlay(ctx, canvas) {
  if (!images.shadow || !shared.shade) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = shared.shade / 100;
  const rotation = shared.rotation * Math.PI / 180;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rotation);
  const w = Math.abs(width * Math.cos(rotation)) + Math.abs(height * Math.sin(rotation));
  const h = Math.abs(height * Math.cos(rotation)) + Math.abs(width * Math.sin(rotation));
  const blur = shared.shadowBlur;
  const padding = blur * 3;
  if (blur) ctx.filter = `blur(${blur * canvas.width / width}px)`;
  drawArtworkImage(ctx, images.shadow, -w / 2 - padding, -h / 2 - padding, w + 2 * padding, h + 2 * padding);
  ctx.restore();
}

// High-precision floating-point pass for 4K export:
// Combines matte fine-art paper look (on artwork pixels), continuous directional
// linear-RGB room lighting + screen dimming, and triangular-PDF (TPDF) 1-LSB dithering
// in a single floating-point pass before final 8-bit quantization (zero banding, zero double rounding).
function applyHighPrecisionFloatPass(ctx, x, y, w, h, profile, lightX, lightY) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const paperStrength = profile.paperLook / 100;
  const sat = 1 - 0.16 * paperStrength;
  const knee = 0.65;
  const invKneeRange = 1 / (1 - knee);
  const ceilingDrop = 0.16 * paperStrength;
  const liftR = 0.042 * paperStrength;
  const liftG = 0.036 * paperStrength;
  const liftB = 0.028 * paperStrength;

  const strength = profile.ledStrength / 100;
  const artStrength = strength * (profile.artLight / 100);
  const dimFactor = Math.max(0.4, 1 - profile.screenDim / 100);
  const hasMatteLight = strength > 0 || dimFactor < 0.999;
  const hasArtLight = artStrength > 0 || dimFactor < 0.999;

  // Precompute a 4096-entry Float32 lookup table of the exact linear-RGB light curve
  const LUT_SIZE = 4096;
  const lut = new Float32Array((LUT_SIZE + 1) * 3);
  if (strength > 0) {
    const params = getLightFieldParams(profile);
    for (let i = 0; i <= LUT_SIZE; i++) {
      const srgb = sampleLightSrgbAt(i / LUT_SIZE, params);
      lut[i * 3] = srgb[0];
      lut[i * 3 + 1] = srgb[1];
      lut[i * 3 + 2] = srgb[2];
    }
  } else {
    lut.fill(1);
  }

  const ux = -lightX;
  const uy = -lightY;
  const halfExtent = Math.max(1, (width / 2) * Math.abs(ux) + (height / 2) * Math.abs(uy));
  const invSpan = 1 / (2 * halfExtent);
  const halfW = width / 2;
  const halfH = height / 2;
  const xEnd = x + w;
  const yEnd = y + h;

  // Fast deterministic PRNG for triangular-PDF (TPDF) +-0.5 LSB dithering
  let seed = 0x9e3779b9;
  const nextRand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed * 2.3283064365386963e-10; // [0, 1)
  };

  let idx = 0;
  for (let py = 0; py < height; py++) {
    const inY = py >= y && py < yEnd;
    const dyProj = (py - halfH) * uy + halfExtent;

    for (let px = 0; px < width; px++, idx += 4) {
      let r = data[idx] / 255;
      let g = data[idx + 1] / 255;
      let b = data[idx + 2] / 255;
      const inArt = inY && px >= x && px < xEnd;

      // 1. Floating-point matte paper print simulation on artwork pixels
      if (inArt && paperStrength > 0.001) {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = luma + (r - luma) * sat;
        g = luma + (g - luma) * sat;
        b = luma + (b - luma) * sat;

        const maxVal = r > g ? (r > b ? r : b) : (g > b ? g : b);
        if (maxVal > knee) {
          const over = (maxVal - knee) * invKneeRange;
          const outMax = knee + (1 - knee) * over - ceilingDrop * over * over;
          const scale = outMax / maxVal;
          r *= scale;
          g *= scale;
          b *= scale;
        }

        const invL = 1 - luma;
        const shadowWeight = invL * invL * Math.sqrt(invL > 0 ? invL : 0);
        r += liftR * shadowWeight;
        g += liftG * shadowWeight;
        b += liftB * shadowWeight;
      }

      // 2. Continuous floating-point directional lighting + screen dimming
      const s = inArt ? artStrength : strength;
      if (inArt ? hasArtLight : hasMatteLight) {
        let t = ((px - halfW) * ux + dyProj) * invSpan;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const fPos = t * LUT_SIZE;
        const i0 = fPos | 0;
        const frac = fPos - i0;
        const o0 = i0 * 3;
        const o1 = o0 + 3;
        const lr = lut[o0] + (lut[o1] - lut[o0]) * frac;
        const lg = lut[o0 + 1] + (lut[o1 + 1] - lut[o0 + 1]) * frac;
        const lb = lut[o0 + 2] + (lut[o1 + 2] - lut[o0 + 2]) * frac;

        const oneMinusS = 1 - s;
        r *= (oneMinusS + s * lr) * dimFactor;
        g *= (oneMinusS + s * lg) * dimFactor;
        b *= (oneMinusS + s * lb) * dimFactor;
      }

      // 3. TPDF 1-LSB dither before final 8-bit quantization
      const dither = nextRand() + nextRand() - 1;
      const qr = r * 255 + dither;
      const qg = g * 255 + dither;
      const qb = b * 255 + dither;
      data[idx] = qr <= 0 ? 0 : qr >= 255 ? 255 : Math.round(qr);
      data[idx + 1] = qg <= 0 ? 0 : qg >= 255 ? 255 : Math.round(qg);
      data[idx + 2] = qb <= 0 ? 0 : qb >= 255 ? 255 : Math.round(qb);
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function render(canvas, { profileName = activeProfile, skipLighting = false, highPrecision = false } = {}) {
  const profile = profiles[profileName];
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Exact integer 4K pixel alignment eliminates sub-pixel resampling blur
  const x = Math.round(width * shared.matX / 100);
  const y = Math.round(height * shared.matY / 100);
  const w = width - 2 * x;
  const h = height - 2 * y;
  const angle = profile.angle * Math.PI / 180;
  const lightX = Math.cos(angle);
  const lightY = Math.sin(angle);

  if (highPrecision && !skipLighting && canvas.width === width && canvas.height === height) {
    // 1. Raw crisp artwork inside opening (paperLook deferred to single float pass)
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    drawPreparedArtwork(ctx, canvas, x, y, w, h, 0);
    ctx.restore();

    // 2. Passe-partout cardboard + paper grain + shaded bevel
    drawMat(ctx, x, y, w, h);
    drawBevel(ctx, x, y, w, h, lightX, lightY, profile, 'shadow');

    // 3. Single floating-point pass: paperLook + directional linear-RGB light + dimming + TPDF dither
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    applyHighPrecisionFloatPass(ctx, x, y, w, h, profile, lightX, lightY);

    // 4. Inner mat opening cast shadow (multiplicative, clipped to artwork)
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    drawInnerMatShadow(ctx, x, y, w, h, lightX, lightY);
    ctx.restore();

    // 5. Lit 45° bevel catchlight, bezel shadows, and optional extra shadow overlay
    drawBevel(ctx, x, y, w, h, lightX, lightY, profile, 'highlight');
    drawBezelShadows(ctx, profile, lightX, lightY);
    drawExtraShadowOverlay(ctx, canvas);
    return;
  }

  // Interactive fast GPU path for live preview
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  drawPreparedArtwork(ctx, canvas, x, y, w, h, skipLighting ? 0 : profile.paperLook / 100);
  drawInnerMatShadow(ctx, x, y, w, h, lightX, lightY);
  ctx.restore();

  drawMat(ctx, x, y, w, h);

  if (skipLighting) {
    drawBevel(ctx, x, y, w, h, lightX, lightY, profile, 'all');
  } else {
    drawBevel(ctx, x, y, w, h, lightX, lightY, profile, 'shadow');
    drawRoomLighting(ctx, x, y, w, h, profile, lightX, lightY);
    drawBevel(ctx, x, y, w, h, lightX, lightY, profile, 'highlight');
    drawBezelShadows(ctx, profile, lightX, lightY);
    drawExtraShadowOverlay(ctx, canvas);
  }
}

let pending = false;
function refresh() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const hasOverlay = Boolean(images.shadow);
    get('shade').disabled = !hasOverlay;
    get('rotation').disabled = !hasOverlay;
    get('shadowBlur').disabled = !hasOverlay;
    updateMatSummary();
    updateRampPreview();
    render(preview, { profileName: activeProfile, skipLighting: compareOriginal });
  });
}

function syncPresetButtons() {
  const current = profiles[activeProfile].preset;
  for (const btn of document.querySelectorAll('.preset')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.preset === current));
  }
}

function syncProfileUI() {
  const label = PROFILE_LABELS[activeProfile];
  const profile = profiles[activeProfile];

  for (const btn of document.querySelectorAll('.profile-btn')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.profile === activeProfile));
  }
  get('stage').dataset.scene = activeProfile;
  get('lightLegend').textContent = `Licht & dimming · ${label}-versie`;
  get('saveSingle').textContent = `Alleen ${label}`;
  get('sendTvSingle').textContent = `Alleen ${label}`;

  get('ledColor').value = profile.ledColor;
  get('shadowColor').value = profile.shadowColor;
  for (const key of PROFILE_KEYS) {
    if (slidersMeta.has(key)) updateSliderUI(key, profile[key]);
  }
  syncPresetButtons();
}

function updateMatSummary() {
  const el = get('matSummary');
  if (!el) return;
  const x = Math.round(shared.matX * 10) / 10;
  const y = Math.round(shared.matY * 10) / 10;
  const bevel = Math.round(shared.bevel);
  el.textContent = `${x}% / ${y}% · ${bevel} px`;
}

function syncSharedUI() {
  get('fitMode').value = shared.fitMode;
  get('matColor').value = shared.matColor;
  for (const [id] of slidersMeta) {
    if (!PROFILE_KEYS.has(id)) updateSliderUI(id, shared[id]);
  }
  updateMatSummary();
}

function switchProfile(name) {
  if (!profiles[name] || name === activeProfile) return;
  activeProfile = name;
  syncProfileUI();
  saveState();
  refresh();
}

function applyPreset(name, silent = false) {
  const preset = LIGHT_PRESETS[name];
  if (!preset) return;
  Object.assign(profiles[activeProfile], preset, { preset: name });
  syncProfileUI();
  if (!silent) {
    saveState();
    refresh();
  }
}

function sanitizeProfile(savedProfile, fallback) {
  const next = { ...fallback };
  if (!savedProfile || typeof savedProfile !== 'object') return next;
  for (const colorKey of ['ledColor', 'shadowColor']) {
    if (typeof savedProfile[colorKey] === 'string' && /^#[0-9a-f]{6}$/i.test(savedProfile[colorKey])) {
      next[colorKey] = savedProfile[colorKey];
    }
  }
  for (const key of PROFILE_KEYS) {
    if (slidersMeta.has(key) && Number.isFinite(savedProfile[key])) {
      const meta = slidersMeta.get(key);
      next[key] = Math.min(meta.max, Math.max(meta.min, Math.round(savedProfile[key])));
    }
  }
  next.preset = typeof savedProfile.preset === 'string' ? savedProfile.preset : null;
  return next;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeProfile,
      shared: { ...shared },
      profiles: {
        day: { ...profiles.day },
        evening: { ...profiles.evening }
      },
      tvAddress: get('tvAddress').value,
      tvReplacePrevious: get('tvReplacePrevious').checked,
      wallPreview: get('wallPreview').getAttribute('aria-pressed') === 'true'
    }));
  } catch {
    // Ignore storage quota/privacy errors
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Carry over saved TV IP address from previous version while adopting new directional daylight defaults
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        if (typeof legacy.tvAddress === 'string' && legacy.tvAddress.trim()) {
          get('tvAddress').value = legacy.tvAddress.trim();
        }
        if (typeof legacy.tvReplacePrevious === 'boolean') {
          get('tvReplacePrevious').checked = legacy.tvReplacePrevious;
        }
      }
      return;
    }
    const saved = JSON.parse(raw);

    if (saved.shared && typeof saved.shared === 'object') {
      if (saved.shared.fitMode === 'cover' || saved.shared.fitMode === 'contain') {
        shared.fitMode = saved.shared.fitMode;
      }
      if (typeof saved.shared.matColor === 'string' && /^#[0-9a-f]{6}$/i.test(saved.shared.matColor)) {
        shared.matColor = saved.shared.matColor;
      }
      for (const [id, meta] of slidersMeta) {
        if (!PROFILE_KEYS.has(id) && Number.isFinite(saved.shared[id])) {
          shared[id] = Math.min(meta.max, Math.max(meta.min, Math.round(saved.shared[id])));
        }
      }
    }

    if (saved.profiles && typeof saved.profiles === 'object') {
      profiles.day = sanitizeProfile(saved.profiles.day, { ...LIGHT_PRESETS.daylight, preset: 'daylight' });
      profiles.evening = sanitizeProfile(saved.profiles.evening, { ...LIGHT_PRESETS.darkRoom, preset: 'darkRoom' });
    }

    if (saved.activeProfile === 'day' || saved.activeProfile === 'evening') {
      activeProfile = saved.activeProfile;
    }
    if (typeof saved.tvAddress === 'string' && saved.tvAddress.trim()) {
      get('tvAddress').value = saved.tvAddress.trim();
    }
    if (typeof saved.tvReplacePrevious === 'boolean') {
      get('tvReplacePrevious').checked = saved.tvReplacePrevious;
    }
    if (typeof saved.wallPreview === 'boolean') {
      get('wallPreview').setAttribute('aria-pressed', String(saved.wallPreview));
      get('stage').dataset.wall = String(saved.wallPreview);
    }
  } catch {
    // Ignore malformed saved state
  }
}

function resetAllSettings() {
  Object.assign(shared, SHARED_DEFAULTS);
  profiles.day = { ...LIGHT_PRESETS.daylight, preset: 'daylight' };
  profiles.evening = { ...LIGHT_PRESETS.darkRoom, preset: 'darkRoom' };
  activeProfile = 'evening';
  compareOriginal = false;
  get('compareOriginal').setAttribute('aria-pressed', 'false');
  syncSharedUI();
  syncProfileUI();
  saveState();
  get('status').textContent = 'Standaardinstellingen hersteld (Dag + Donkere avond).';
  refresh();
}

function autoFitMatToArt() {
  const img = images.art;
  if (!img) {
    get('status').textContent = 'Open eerst een afbeelding om het karton automatisch aan te passen.';
    return;
  }
  const imgAspect = img.width / img.height;
  const maxInnerW = width * (1 - 2 * 5 / 100);
  const maxInnerH = height * (1 - 2 * 8 / 100);

  let targetW, targetH;
  if (imgAspect > maxInnerW / maxInnerH) {
    targetW = maxInnerW;
    targetH = targetW / imgAspect;
  } else {
    targetH = maxInnerH;
    targetW = targetH * imgAspect;
  }

  const nextMatX = Math.min(35, Math.max(3, Math.round(((width - targetW) / (2 * width)) * 100)));
  const nextMatY = Math.min(35, Math.max(4, Math.round(((height - targetH) / (2 * height)) * 100)));
  setSlider('matX', nextMatX, true);
  setSlider('matY', nextMatY, true);
  setSlider('zoom', 100, true);
  setSlider('panX', 0, true);
  setSlider('panY', 0, true);
  saveState();
  get('status').textContent = `Passe-partout aangepast aan beeldverhouding (${nextMatX}% / ${nextMatY}%).`;
  refresh();
}

function assetInput(id, fallback, clear) {
  const input = get(id);
  let request = 0;

  async function load(file, source) {
    const currentRequest = ++request;
    const url = source || URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (currentRequest !== request) return;
      images[id] = image;
      if (id === 'art') {
        artVersion++;
        currentArtFilename = file.name.replace(/\.[^.]+$/, '');
        get(id + 'Name').textContent = `${file.name} (${image.width} × ${image.height} px)`;
      } else {
        get(id + 'Name').textContent = file.name;
      }
      get('status').textContent = '';
      if (clear) get(clear).hidden = false;
      refresh();
    } catch {
      if (currentRequest === request) {
        get('status').textContent = 'Deze afbeelding kon niet worden geopend. Probeer een PNG, JPEG of WebP.';
      }
    } finally {
      if (url && !source) URL.revokeObjectURL(url);
    }
  }

  function reset() {
    request++;
    images[id] = null;
    if (id === 'art') artVersion++;
    get(id + 'Name').textContent = fallback;
    if (clear) get(clear).hidden = true;
    get('status').textContent = '';
    refresh();
  }

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    load(file);
  });

  if (clear) get(clear).addEventListener('click', reset);
  return { load, reset };
}

function assetLibrary(id, fallback, clear, directory, count, digits, extension) {
  const asset = assetInput(id, fallback, clear);
  const folder = get(id + 'Folder');
  const preset = get(id + 'Preset');
  let libraryFiles = [];

  function show(files) {
    libraryFiles = files;
    preset.replaceChildren(new Option(fallback, ''));
    libraryFiles.forEach((file, index) => preset.add(new Option(file.name, String(index))));
    get(id + 'Library').hidden = false;
  }

  function select(index) {
    const file = libraryFiles[index];
    if (!file) return;
    preset.value = String(index);
    asset.load(file, file.source);
  }

  if ((location.protocol === 'http:' || location.protocol === 'https:') && !isHomeAssistantMode) {
    show(Array.from({ length: count }, (_, index) => {
      const name = String(index + 1).padStart(digits, '0') + '.' + extension;
      return { name, source: encodeURIComponent(directory) + '/' + name };
    }));
  }

  folder.addEventListener('change', () => {
    const files = Array.from(folder.files);
    folder.value = '';
    if (!files.length) return;
    const supported = files.filter(file => /\.(png|jpe?g|webp|avif)$/i.test(file.name));
    if (!supported.length) {
      get('status').textContent = 'In deze map staan geen bruikbare afbeeldingen.';
      return;
    }
    show(supported.sort((a, b) => a.name.localeCompare(b.name, 'nl', { numeric: true })));
    select(0);
  });

  preset.addEventListener('change', () => {
    if (preset.value === '') {
      asset.reset();
    } else {
      select(Number(preset.value));
    }
  });
  get(id).addEventListener('change', () => { preset.value = ''; });
  if (clear) get(clear).addEventListener('click', () => { preset.value = ''; });
  return asset;
}

const isHomeAssistantMode = new URLSearchParams(location.search).has('ha') ||
  location.pathname.startsWith('/frame_art_studio_static');
const isLocalEditor = !isHomeAssistantMode && location.origin === 'http://127.0.0.1:8765';
let haTvs = [];

function getHaBridge() {
  return window.__HA_FRAME_BRIDGE__ || null;
}

const artAsset = assetInput('art');
assetLibrary('texture', 'Ingebouwde papierkorrel', 'clearTexture', 'White Paper Textures', 56, 2, 'jpg');
assetLibrary('shadow', 'Geen extra overlay', 'clearShadow', 'Shadow Overlays', 100, 3, 'png');

// Drag-and-drop image anywhere onto the page or stage
const stage = get('stage');
let dragDepth = 0;
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => {
  event.preventDefault();
  dragDepth = 0;
  stage.classList.remove('is-dragover');
  const file = Array.from(event.dataTransfer?.files || []).find(f => f.type.startsWith('image/'));
  if (file) artAsset.load(file);
});
stage.addEventListener('dragenter', event => {
  event.preventDefault();
  dragDepth++;
  stage.classList.add('is-dragover');
});
stage.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) stage.classList.remove('is-dragover');
});

// Interactive drag-to-pan and pinch/Ctrl-scroll-to-zoom directly on the preview canvas
let dragState = null;
preview.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  preview.setPointerCapture(event.pointerId);
  preview.classList.add('is-dragging');
  dragState = {
    x: event.clientX,
    y: event.clientY,
    panX: shared.panX,
    panY: shared.panY
  };
});
preview.addEventListener('pointermove', event => {
  if (!dragState) return;
  const rect = preview.getBoundingClientRect();
  const sensitivity = 200 / Math.max(1, shared.zoom / 100);
  const sign = shared.fitMode === 'contain' && shared.zoom <= 100 ? -1 : 1;
  const dx = ((event.clientX - dragState.x) / rect.width) * sensitivity * sign;
  const dy = ((event.clientY - dragState.y) / rect.height) * sensitivity * sign;
  setSlider('panX', dragState.panX - dx, true);
  setSlider('panY', dragState.panY - dy, true);
  refresh();
});
function endDrag() {
  if (!dragState) return;
  dragState = null;
  preview.classList.remove('is-dragging');
  saveState();
}
preview.addEventListener('pointerup', endDrag);
preview.addEventListener('pointercancel', endDrag);
preview.addEventListener('wheel', event => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const step = event.deltaY > 0 ? -5 : 5;
  setSlider('zoom', shared.zoom + step);
}, { passive: false });

// Controls & toolbar listeners
get('localLibrary').hidden = location.protocol !== 'file:';
get('matColor').addEventListener('input', () => {
  shared.matColor = get('matColor').value;
  saveState();
  refresh();
});
get('fitMode').addEventListener('change', () => {
  shared.fitMode = get('fitMode').value;
  saveState();
  refresh();
});
get('autoMat').addEventListener('click', autoFitMatToArt);
get('resetAll').addEventListener('click', resetAllSettings);

for (const colorId of ['ledColor', 'shadowColor']) {
  get(colorId).addEventListener('input', () => {
    profiles[activeProfile][colorId] = get(colorId).value;
    profiles[activeProfile].preset = null;
    syncPresetButtons();
    saveState();
    refresh();
  });
}

for (const btn of document.querySelectorAll('.preset')) {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
}

for (const btn of document.querySelectorAll('.profile-btn')) {
  btn.addEventListener('click', () => switchProfile(btn.dataset.profile));
}

get('wallPreview').addEventListener('click', () => {
  const next = get('wallPreview').getAttribute('aria-pressed') !== 'true';
  get('wallPreview').setAttribute('aria-pressed', String(next));
  stage.dataset.wall = String(next);
  saveState();
});

get('compareOriginal').addEventListener('click', () => {
  compareOriginal = !compareOriginal;
  get('compareOriginal').setAttribute('aria-pressed', String(compareOriginal));
  refresh();
});

async function exportImage(png, profileName = activeProfile) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  render(canvas, { profileName, skipLighting: false, highPrecision: true });
  const blob = await new Promise(resolve => canvas.toBlob(resolve, png ? 'image/png' : 'image/jpeg', 0.99));
  if (!blob) throw new Error('Geen uitvoer');
  return blob;
}

function buildExportFilename(png, profileName) {
  const ext = png ? 'png' : 'jpg';
  const suffix = profileName === 'day' ? 'dag' : 'avond';
  const base = currentArtFilename
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'the-frame'}-${suffix}-3840x2160.${ext}`;
}

function triggerDownload(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}

async function handleDownload(profileNames) {
  const saveBothBtn = get('save');
  const saveSingleBtn = get('saveSingle');
  const status = get('status');
  saveBothBtn.disabled = true;
  saveSingleBtn.disabled = true;
  try {
    const png = get('format').value === 'PNG';
    const names = [];
    for (let i = 0; i < profileNames.length; i++) {
      const pName = profileNames[i];
      const label = PROFILE_LABELS[pName];
      status.textContent = `4K ${label}-versie maken…`;
      const blob = await exportImage(png, pName);
      const filename = buildExportFilename(png, pName);
      triggerDownload(blob, filename);
      names.push(filename);
      if (i < profileNames.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    status.textContent = names.length === 2
      ? `Beide 4K-versies gedownload: ${names[0]} en ${names[1]}.`
      : `Download gestart (${names[0]}).`;
  } catch {
    status.textContent = 'Het 4K-bestand kon niet worden gemaakt. Probeer het opnieuw.';
  } finally {
    saveBothBtn.disabled = false;
    saveSingleBtn.disabled = false;
  }
}

get('save').addEventListener('click', () => handleDownload(['day', 'evening']));
get('saveSingle').addEventListener('click', () => handleDownload([activeProfile]));

get('tvControls').hidden = !(isLocalEditor || isHomeAssistantMode);
if (isHomeAssistantMode) {
  get('tvAddressField').hidden = true;
  get('tvAddress').required = false;
  get('tvSelectField').hidden = false;
}
get('tvAddress').addEventListener('change', () => {
  saveState();
  loadTvSlots();
});
get('tvSelect').addEventListener('change', () => {
  const selected = haTvs.find(tv => tv.entryId === get('tvSelect').value);
  if (selected) {
    renderTvSlots(selected.slots);
  }
});
get('tvReplacePrevious').addEventListener('change', saveState);

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Kon afbeelding niet coderen.'));
    reader.readAsDataURL(blob);
  });
}

async function copyContentId(contentId, statusEl) {
  try {
    await navigator.clipboard.writeText(contentId);
    if (statusEl) statusEl.textContent = `${contentId} gekopieerd naar klembord.`;
  } catch {
    if (statusEl) statusEl.textContent = `content_id: ${contentId}`;
  }
}

async function tvJsonRequest(url, options = {}) {
  const bridge = isHomeAssistantMode ? getHaBridge() : null;
  if (isHomeAssistantMode && !bridge) {
    throw new Error('Wacht op Home Assistant-verbinding… Probeer over een seconde opnieuw.');
  }
  const response = bridge ? await bridge.fetchWithAuth(url, options) : await fetch(url, options);
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error(
      isHomeAssistantMode
        ? 'Home Assistant gaf geen geldig antwoord. Herlaad de pagina.'
        : 'Start de editor opnieuw via Start The Frame Generator.command.'
    );
  }
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || 'Actie op de tv is mislukt.');
  }
  return payload;
}

function getSelectedHaEntryId() {
  return get('tvSelect').value || haTvs[0]?.entryId || '';
}

function updateCachedHaSlots(entryId, slots) {
  const target = haTvs.find(tv => tv.entryId === entryId);
  if (target && slots) target.slots = slots;
}

function renderTvSlots(slots) {
  const card = get('tvSlotsCard');
  const list = get('tvSlotsList');
  list.replaceChildren();
  const entries = [
    ['Dag', slots?.day],
    ['Avond', slots?.evening]
  ].filter(([, cid]) => Boolean(cid));

  if (!entries.length) {
    card.hidden = true;
    return;
  }

  for (const [label, cid] of entries) {
    const row = document.createElement('div');
    row.className = 'tv-slot-row';

    const info = document.createElement('div');
    info.className = 'tv-slot-info';
    const nameEl = document.createElement('span');
    nameEl.textContent = `${label}:`;
    const codeEl = document.createElement('code');
    codeEl.className = 'tv-slot-code';
    codeEl.textContent = cid;
    info.append(nameEl, codeEl);

    const btns = document.createElement('div');
    btns.className = 'tv-slot-btns';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'mini-btn';
    copyBtn.textContent = 'Kopieer';
    copyBtn.setAttribute('aria-label', `Kopieer ${label} content_id ${cid}`);
    copyBtn.addEventListener('click', () => copyContentId(cid, get('tvStatus')));

    const showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.className = 'mini-btn';
    showBtn.textContent = 'Toon';
    showBtn.setAttribute('aria-label', `Toon ${label} (${cid}) op tv`);
    showBtn.addEventListener('click', () => selectOnTv(cid, get('tvStatus')));

    btns.append(copyBtn, showBtn);
    row.append(info, btns);
    list.append(row);
  }
  card.hidden = false;
}

async function loadTvSlots() {
  if (isHomeAssistantMode) {
    if (!getHaBridge()) return;
    try {
      const payload = await tvJsonRequest('/api/frame_art_studio/config');
      haTvs = payload.tvs || [];
      const select = get('tvSelect');
      const prev = select.value;
      select.replaceChildren();
      for (const tv of haTvs) {
        select.add(new Option(`${tv.name} (${tv.host})`, tv.entryId));
      }
      if (prev && haTvs.some(tv => tv.entryId === prev)) {
        select.value = prev;
      }
      const activeTv = haTvs.find(tv => tv.entryId === select.value) || haTvs[0];
      renderTvSlots(activeTv?.slots || null);
      if (!haTvs.length) {
        get('tvStatus').textContent = 'Voeg eerst je Samsung The Frame toe bij Instellingen → Apparaten & diensten.';
      }
    } catch (error) {
      get('tvStatus').textContent = error.message || 'Kon tv-configuratie niet laden uit Home Assistant.';
    }
    return;
  }

  if (!isLocalEditor) return;
  const address = get('tvAddress').value.trim();
  if (!address) return;
  try {
    const payload = await tvJsonRequest(`/api/tv/slots?address=${encodeURIComponent(address)}`);
    renderTvSlots(payload.slots);
  } catch {
    renderTvSlots(null);
  }
}

async function selectOnTv(contentId, statusEl) {
  if (statusEl) statusEl.textContent = `${contentId} selecteren op de tv…`;
  try {
    let payload;
    if (isHomeAssistantMode) {
      const entryId = getSelectedHaEntryId();
      payload = await tvJsonRequest('/api/frame_art_studio/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, contentId })
      });
      updateCachedHaSlots(entryId, payload.slots);
    } else {
      const address = get('tvAddress').value.trim();
      if (!address) return;
      payload = await tvJsonRequest('/api/tv/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, contentId })
      });
    }
    if (statusEl) statusEl.textContent = payload.message;
    if (tvGalleryDialog.open) {
      for (const item of tvGalleryItems) {
        item.isCurrent = item.contentId === contentId;
      }
      tvGallerySelected.delete(contentId);
      renderTvGallery();
    }
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || 'Selecteren op de tv is niet gelukt.';
  }
}

async function uploadToTv(profileNames) {
  const bothBtn = get('sendTvBoth');
  const singleBtn = get('sendTvSingle');
  if (bothBtn.disabled) return;
  const status = get('tvStatus');
  const replacePrevious = get('tvReplacePrevious').checked;
  saveState();
  bothBtn.disabled = true;
  singleBtn.disabled = true;

  try {
    const ordered = profileNames.length === 2
      ? (activeProfile === 'day' ? ['evening', 'day'] : ['day', 'evening'])
      : profileNames;
    const png = get('format').value === 'PNG';
    const fileType = png ? 'png' : 'jpg';

    if (isHomeAssistantMode) {
      const entryId = getSelectedHaEntryId();
      if (!entryId) {
        throw new Error('Geen Frame TV geconfigureerd in Home Assistant.');
      }
      const results = [];
      let totalDeleted = 0;
      let latestSlots = null;
      for (let i = 0; i < ordered.length; i++) {
        const slot = ordered[i];
        const label = PROFILE_LABELS[slot];
        status.textContent = `${label}-versie voorbereiden en sturen (${i + 1}/${ordered.length})…`;
        const blob = await exportImage(png, slot);
        const payload = await tvJsonRequest('/api/frame_art_studio/upload', {
          method: 'POST',
          headers: {
            'Content-Type': png ? 'image/png' : 'image/jpeg',
            'X-Frame-Entry-Id': entryId,
            'X-Frame-Slot': slot,
            'X-Frame-Select': i === ordered.length - 1 ? '1' : '0',
            'X-Frame-Replace-Previous': replacePrevious ? '1' : '0'
          },
          body: blob
        });
        results.push({ slot, label, contentId: payload.contentId });
        totalDeleted += (payload.deleted || []).length;
        latestSlots = payload.slots;
      }
      updateCachedHaSlots(entryId, latestSlots);
      renderTvSlots(latestSlots);
      const summary = results
        .sort((a, b) => (a.slot === 'day' ? -1 : 1))
        .map(r => `${r.label}: ${r.contentId}`)
        .join(' · ');
      const removed = totalDeleted ? ` · ${totalDeleted} vorige verwijderd` : '';
      status.textContent = results.length === 2
        ? `Dag- en Avond-versie op de tv gezet (${summary}${removed}). HA-sensors zijn bijgewerkt.`
        : `Foto op de tv gezet (${summary}${removed}). HA-sensor is bijgewerkt.`;
      return;
    }

    const address = get('tvAddress').value.trim();
    if (!address) return;
    status.textContent = ordered.length === 2
      ? 'Dag- en Avond-versie voorbereiden en in één sessie naar tv sturen…'
      : `${PROFILE_LABELS[ordered[0]]}-versie naar tv sturen…`;

    const items = [];
    for (let i = 0; i < ordered.length; i++) {
      const slot = ordered[i];
      const blob = await exportImage(png, slot);
      items.push({
        slot,
        fileType,
        imageBase64: await blobToBase64(blob),
        select: i === ordered.length - 1
      });
    }

    const payload = await tvJsonRequest('/api/art/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        items,
        replacePrevious
      })
    });
    renderTvSlots(payload.slots);
    status.textContent = payload.message;
  } catch (error) {
    status.textContent = error.message || 'Versturen is niet gelukt. Controleer de verbinding met de tv.';
  } finally {
    bothBtn.disabled = false;
    singleBtn.disabled = false;
  }
}

get('tvForm').addEventListener('submit', event => {
  event.preventDefault();
  uploadToTv(['day', 'evening']);
});
get('sendTvSingle').addEventListener('click', () => uploadToTv([activeProfile]));

// Native modal dialog for Samsung The Frame "Mijn foto's" gallery & bulk cleanup
const tvGalleryDialog = get('tvGalleryDialog');
const tvGalleryGrid = get('tvGalleryGrid');
const tvGalleryStatus = get('tvGalleryStatus');
let tvGalleryItems = [];
let tvGalleryError = '';
let tvGalleryLoading = false;
const tvGallerySelected = new Set();

// Safari fallback for closedby="any" light dismiss
if (!('closedBy' in HTMLDialogElement.prototype)) {
  const isOutsideDialog = (event, dialog) => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
  };
  let pressedOutside = false;
  tvGalleryDialog.addEventListener('pointerdown', event => {
    pressedOutside = isOutsideDialog(event, tvGalleryDialog);
  });
  tvGalleryDialog.addEventListener('pointerup', event => {
    if (pressedOutside && isOutsideDialog(event, tvGalleryDialog)) {
      tvGalleryDialog.close();
    }
    pressedOutside = false;
  });
}

function updateTvSelectionButtons() {
  const count = tvGallerySelected.size;
  const delBtn = get('deleteSelectedTvArt');
  delBtn.textContent = `Verwijder geselecteerde (${count})`;
  delBtn.disabled = count === 0;
}

function renderTvGallery() {
  tvGalleryGrid.replaceChildren();
  updateTvSelectionButtons();

  if (tvGalleryLoading) {
    const loading = document.createElement('p');
    loading.className = 'tv-empty';
    loading.textContent = 'Verbinden met de tv en lijst ophalen…';
    tvGalleryGrid.append(loading);
    return;
  }

  if (tvGalleryError) {
    const err = document.createElement('p');
    err.className = 'tv-empty';
    err.textContent = tvGalleryError;
    tvGalleryGrid.append(err);
    return;
  }

  if (!tvGalleryItems.length) {
    const empty = document.createElement('p');
    empty.className = 'tv-empty';
    empty.textContent = 'Geen eigen foto’s gevonden in Mijn foto’s op deze tv.';
    tvGalleryGrid.append(empty);
    return;
  }

  for (const item of tvGalleryItems) {
    const cid = item.contentId;
    const isSelected = tvGallerySelected.has(cid);
    const card = document.createElement('article');
    card.className = 'tv-card' +
      (isSelected ? ' is-selected' : '') +
      (item.isCurrent ? ' is-current' : '');

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'tv-thumb-wrap';
    if (item.thumbnail) {
      const img = document.createElement('img');
      img.className = 'tv-thumb';
      img.src = item.thumbnail;
      img.alt = `Miniatuur van ${cid}`;
      img.loading = 'lazy';
      thumbWrap.append(img);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'tv-thumb-empty';
      placeholder.textContent = cid;
      thumbWrap.append(placeholder);
    }

    if (item.isCurrent || item.slot) {
      const badges = document.createElement('div');
      badges.className = 'tv-badges';
      if (item.isCurrent) {
        const b = document.createElement('span');
        b.className = 'tv-badge is-accent';
        b.textContent = 'Actief op tv';
        badges.append(b);
      }
      if (item.slot) {
        const b = document.createElement('span');
        b.className = 'tv-badge';
        b.textContent = item.slot === 'day' ? 'Dag' : 'Avond';
        badges.append(b);
      }
      thumbWrap.append(badges);
    }

    const head = document.createElement('div');
    head.className = 'tv-card-head';

    const checkWrap = document.createElement('div');
    checkWrap.className = 'tv-card-check';
    const checkId = `tv-item-${cid}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = checkId;
    checkbox.checked = isSelected;
    checkbox.disabled = item.isCurrent;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        tvGallerySelected.add(cid);
      } else {
        tvGallerySelected.delete(cid);
      }
      card.classList.toggle('is-selected', checkbox.checked);
      updateTvSelectionButtons();
    });

    const label = document.createElement('label');
    label.htmlFor = checkId;
    const code = document.createElement('code');
    code.className = 'tv-slot-code';
    code.textContent = cid;
    label.append(code);
    checkWrap.append(checkbox, label);

    const dateEl = document.createElement('span');
    dateEl.className = 'tv-card-date';
    dateEl.textContent = item.date ? item.date.slice(0, 10).replaceAll(':', '-') : '';
    head.append(checkWrap, dateEl);

    const actions = document.createElement('div');
    actions.className = 'tv-card-actions';

    const showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.className = 'mini-btn';
    showBtn.textContent = 'Toon';
    showBtn.disabled = item.isCurrent;
    showBtn.setAttribute('aria-label', `Toon ${cid} op tv`);
    showBtn.addEventListener('click', () => selectOnTv(cid, tvGalleryStatus));

    const dayBtn = document.createElement('button');
    dayBtn.type = 'button';
    dayBtn.className = 'mini-btn';
    dayBtn.textContent = 'Als Dag';
    dayBtn.disabled = item.slot === 'day';
    dayBtn.setAttribute('aria-label', `Koppel ${cid} als Dag-versie`);
    dayBtn.addEventListener('click', () => assignTvSlot('day', cid));

    const eveningBtn = document.createElement('button');
    eveningBtn.type = 'button';
    eveningBtn.className = 'mini-btn';
    eveningBtn.textContent = 'Als Avond';
    eveningBtn.disabled = item.slot === 'evening';
    eveningBtn.setAttribute('aria-label', `Koppel ${cid} als Avond-versie`);
    eveningBtn.addEventListener('click', () => assignTvSlot('evening', cid));

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'mini-btn';
    copyBtn.textContent = 'Kopieer ID';
    copyBtn.setAttribute('aria-label', `Kopieer content_id ${cid}`);
    copyBtn.addEventListener('click', () => copyContentId(cid, tvGalleryStatus));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'mini-btn danger';
    delBtn.textContent = 'Verwijder';
    delBtn.disabled = item.isCurrent;
    delBtn.setAttribute('aria-label', `Verwijder ${cid} van tv`);
    delBtn.addEventListener('click', () => deleteTvItems([cid]));

    actions.append(showBtn, dayBtn, eveningBtn, copyBtn, delBtn);
    card.append(thumbWrap, head, actions);
    tvGalleryGrid.append(card);
  }
}

async function assignTvSlot(slot, contentId) {
  const label = slot === 'day' ? 'Dag' : 'Avond';
  tvGalleryStatus.textContent = `${contentId} koppelen als ${label}-versie…`;
  try {
    let payload;
    if (isHomeAssistantMode) {
      const entryId = getSelectedHaEntryId();
      if (!entryId) {
        throw new Error('Geen Frame TV geconfigureerd in Home Assistant.');
      }
      payload = await tvJsonRequest('/api/frame_art_studio/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, slot, contentId })
      });
      updateCachedHaSlots(entryId, payload.slots);
    } else {
      const address = get('tvAddress').value.trim();
      if (!address) {
        throw new Error('Vul eerst het IP-adres van de tv in.');
      }
      payload = await tvJsonRequest('/api/tv/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, slot, contentId })
      });
    }
    for (const item of tvGalleryItems) {
      if (item.contentId === contentId) {
        item.slot = slot;
      } else if (item.slot === slot) {
        item.slot = null;
      }
    }
    renderTvSlots(payload.slots);
    renderTvGallery();
    tvGalleryStatus.textContent = payload.message || `${contentId} gekoppeld als ${label}-versie.`;
  } catch (error) {
    tvGalleryStatus.textContent = error.message || `Koppelen als ${label}-versie is niet gelukt.`;
  }
}

async function fetchTvGallery() {
  const refreshBtn = get('refreshTvGallery');
  refreshBtn.disabled = true;
  tvGalleryLoading = true;
  tvGalleryError = '';
  try {
    let url;
    if (isHomeAssistantMode) {
      const entryId = getSelectedHaEntryId();
      if (!entryId) {
        throw new Error('Geen Frame TV geconfigureerd in Home Assistant.');
      }
      tvGalleryStatus.textContent = 'Verbinden met de tv via Home Assistant…';
      url = `/api/frame_art_studio/library?entry_id=${encodeURIComponent(entryId)}`;
    } else {
      const address = get('tvAddress').value.trim();
      if (!address) {
        throw new Error('Vul eerst het IP-adres van de tv in.');
      }
      tvGalleryStatus.textContent = `Verbinden met ${address} en lijst ophalen…`;
      url = `/api/tv/library?address=${encodeURIComponent(address)}`;
    }
    renderTvGallery();
    const payload = await tvJsonRequest(url);
    tvGalleryLoading = false;
    tvGalleryItems = payload.items || [];
    tvGallerySelected.clear();
    if (isHomeAssistantMode) updateCachedHaSlots(getSelectedHaEntryId(), payload.slots);
    renderTvSlots(payload.slots);
    renderTvGallery();
    tvGalleryStatus.textContent = payload.message;
  } catch (error) {
    tvGalleryLoading = false;
    tvGalleryItems = [];
    tvGallerySelected.clear();
    tvGalleryError = error.message || 'Kon de lijst op de tv niet ophalen.';
    renderTvGallery();
    tvGalleryStatus.textContent = tvGalleryError;
  } finally {
    refreshBtn.disabled = false;
  }
}

async function deleteTvItems(contentIds) {
  if (!contentIds.length) return;
  const delBtn = get('deleteSelectedTvArt');
  delBtn.disabled = true;
  tvGalleryStatus.textContent = `${contentIds.length} foto('s) verwijderen van de tv…`;
  try {
    let payload;
    if (isHomeAssistantMode) {
      const entryId = getSelectedHaEntryId();
      payload = await tvJsonRequest('/api/frame_art_studio/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, contentIds })
      });
      updateCachedHaSlots(entryId, payload.slots);
    } else {
      const address = get('tvAddress').value.trim();
      if (!address) return;
      payload = await tvJsonRequest('/api/tv/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, contentIds })
      });
    }
    const deletedSet = new Set(payload.deleted || []);
    tvGalleryItems = tvGalleryItems.filter(it => !deletedSet.has(it.contentId));
    for (const cid of deletedSet) tvGallerySelected.delete(cid);
    renderTvSlots(payload.slots);
    renderTvGallery();
    tvGalleryStatus.textContent = payload.message;
  } catch (error) {
    tvGalleryStatus.textContent = error.message || 'Verwijderen op de tv is niet gelukt.';
    updateTvSelectionButtons();
  }
}

function syncHaNarrowState() {
  const menuBtn = get('haMenuBtn');
  if (!menuBtn) return;
  const bridge = getHaBridge();
  const isNarrow = Boolean(
    bridge?.narrow || document.documentElement.dataset.haNarrow === 'true'
  );
  menuBtn.hidden = !(isHomeAssistantMode && isNarrow);
}

const haMenuBtn = get('haMenuBtn');
if (haMenuBtn) {
  haMenuBtn.addEventListener('click', () => {
    getHaBridge()?.toggleMenu?.();
  });
}

window.addEventListener('ha-frame-narrow-change', syncHaNarrowState);

window.addEventListener('ha-frame-bridge-ready', () => {
  syncHaNarrowState();
  if (isHomeAssistantMode) loadTvSlots();
});

get('openTvGallery').addEventListener('click', () => {
  tvGalleryDialog.showModal();
  fetchTvGallery();
});
get('refreshTvGallery').addEventListener('click', fetchTvGallery);
get('selectOldTvArt').addEventListener('click', () => {
  tvGallerySelected.clear();
  for (const item of tvGalleryItems) {
    if (!item.isCurrent && !item.slot) {
      tvGallerySelected.add(item.contentId);
    }
  }
  renderTvGallery();
  tvGalleryStatus.textContent = tvGallerySelected.size
    ? `${tvGallerySelected.size} oude foto's geselecteerd (actief en huidige Dag/Avond blijven bewaard).`
    : 'Geen extra oude foto’s om te selecteren.';
});
get('clearTvSelection').addEventListener('click', () => {
  tvGallerySelected.clear();
  renderTvGallery();
});
get('deleteSelectedTvArt').addEventListener('click', () => {
  deleteTvItems(Array.from(tvGallerySelected));
});

loadState();
syncSharedUI();
syncProfileUI();
syncHaNarrowState();
loadTvSlots();
refresh();
