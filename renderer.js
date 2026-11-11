/** Canvas song-card renderer. */
export const DEFAULT_SETTINGS = Object.freeze({
  Title: '銀の黎明か、黒の晶華か。', Artist: 'かめりあ vs t+pazolite',
  Rank: 19, Difficulty: 4, CourseUra: true, Ura: true, HasUra: true,
  Level: 10, EasyLevel: 5, NormalLevel: 7, HardLevel: 8, OniLevel: 10, UraLevel: 10,
  TitleSize: 42, ArtistSize: 24, Scale: 2, Angle: 0, Skew: 0, OriginalFont: true,
});

export function normalizeSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('설정은 JSON 객체여야 합니다.');
  const s = { ...DEFAULT_SETTINGS, ...input };
  s.CourseUra = input.CourseUra ?? input.Ura ?? DEFAULT_SETTINGS.CourseUra;
  const selected = s.Difficulty === 1 ? 'EasyLevel' : s.Difficulty === 2 ? 'NormalLevel' : s.Difficulty === 3 ? 'HardLevel' : s.CourseUra ? 'UraLevel' : 'OniLevel';
  for (const key of ['EasyLevel', 'NormalLevel', 'HardLevel', 'OniLevel', 'UraLevel']) {
    if (input[key] === undefined || input[key] === 0) {
      s[key] = key === selected && input.Level !== undefined ? input.Level : DEFAULT_SETTINGS[key];
    }
  }
  if ((input.UraLevel === undefined || input.UraLevel === 0) && !s.CourseUra) s.UraLevel = s.OniLevel;
  s.HasUra = Boolean(s.HasUra || s.Ura || s.CourseUra);
  return s;
}

export function validateSettings(input = {}) {
  const s = normalizeSettings(input);
  const ranges = {
    Rank: [1, 19], Difficulty: [1, 4], Level: [1, 99],
    EasyLevel: [1, 99], NormalLevel: [1, 99], HardLevel: [1, 99], OniLevel: [1, 99], UraLevel: [1, 99],
    TitleSize: [16, 72], ArtistSize: [12, 44], Scale: [1, 4], Angle: [-15, 15], Skew: [-15, 15],
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isInteger(s[key]) || s[key] < min || s[key] > max) throw new RangeError(`${key}: ${min}~${max} 사이의 정수를 입력해 주세요.`);
  }
  if (typeof s.Title !== 'string' || typeof s.Artist !== 'string' || s.Title.length > 160 || s.Artist.length > 220) throw new RangeError('제목은 160자, 아티스트는 220자까지 입력할 수 있습니다.');
  for (const key of ['CourseUra', 'Ura', 'OriginalFont']) if (typeof s[key] !== 'boolean') throw new TypeError(`${key} 값이 올바르지 않습니다.`);
  if (s.CourseUra && s.Difficulty !== 4) throw new RangeError('상단 과제곡 우라는 오니 난이도에서만 사용할 수 있습니다.');
  s.Level = s.Difficulty === 1 ? s.EasyLevel : s.Difficulty === 2 ? s.NormalLevel : s.Difficulty === 3 ? s.HardLevel : s.CourseUra ? s.UraLevel : s.OniLevel;
  return s;
}

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = Math.max(1, Math.ceil(width)); result.height = Math.max(1, Math.ceil(height));
  return result;
}
function context(target) {
  const g = target.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('이 브라우저에서 Canvas 2D를 사용할 수 없습니다.');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  return g;
}
export function alphaBounds(image, threshold = 0) {
  const w = image.width, h = image.height;
  const pixels = context(image).getImageData(0, 0, w, h).data;
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0, at = 3; y < h; y++) for (let x = 0; x < w; x++, at += 4) {
    if (pixels[at] > threshold) {
      if (x < left) left = x; if (x > right) right = x;
      if (y < top) top = y; bottom = y;
    }
  }
  if (right < left) return { x: 0, y: 0, width: 1, height: 1 };
  left = Math.max(0, left - 1); top = Math.max(0, top - 1);
  return { x: left, y: top, width: Math.min(w, right + 2) - left, height: Math.min(h, bottom + 2) - top };
}
function crop(image, r) {
  const out = canvas(r.width, r.height);
  context(out).drawImage(image, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  return out;
}
function tint(image, color) {
  const result = canvas(image.width, image.height), g = context(result);
  g.drawImage(image, 0, 0); g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, result.width, result.height);
  return result;
}
function fit(g, image, rect) {
  const factor = Math.min(rect.width / image.width, rect.height / image.height);
  const w = image.width * factor, h = image.height * factor;
  g.drawImage(image, rect.x + (rect.width - w) / 2, rect.y + (rect.height - h) / 2, w, h);
}
async function loadImage(url) {
  const im = new Image();
  im.decoding = 'async'; im.src = url;
  try { await im.decode(); } catch { throw new Error(`이미지 리소스를 불러오지 못했습니다: ${url}`); }
  return im;
}

/** Load all required assets once. The returned render() is synchronous. */
export async function createRenderer(baseUrl = './assets/') {
  const base = new URL(baseUrl, document.baseURI);
  const response = await fetch(new URL('manifest.json', base));
  if (!response.ok) throw new Error(`리소스 목록을 불러오지 못했습니다 (${response.status}).`);
  const manifest = await response.json();
  if (manifest.version !== 1) throw new Error('지원하지 않는 리소스 버전입니다.');
  const fontEntries = Object.entries(manifest.fonts);
  const [spritePages, fontPages, smoothFont] = await Promise.all([
    Promise.all(manifest.sprites.pages.map(file => loadImage(new URL(file, base).href))),
    Promise.all(fontEntries.map(async ([name, font]) => [name, await Promise.all(font.pages.map(file => loadImage(new URL(file, base).href)))])),
    (async () => {
      const font = new FontFace('DanSeurat', `url("${new URL('Seurat.otf', base).href}")`);
      await font.load(); document.fonts.add(font); return font;
    })(),
  ]);
  const pages = Object.fromEntries(fontPages);
  const tileCache = new Map(), numberCache = new Map(), textCache = new Map();
  let disposed = false;
  const sprites = Object.fromEntries(Object.entries(manifest.sprites.items).map(([key, item]) => {
    const vs = item.vertices, xs = vs.map(v => v[0]), ys = vs.map(v => v[1]);
    const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys);
    const tl = vs.find(v => v[0] === l && v[1] === t), tr = vs.find(v => v[0] === r && v[1] === t), bl = vs.find(v => v[0] === l && v[1] === b);
    return [key, { ...item, l, r, t, b, flipX: tl[2] > tr[2], flipY: tl[3] > bl[3] }];
  }));
  function tile(key) {
    if (tileCache.has(key)) return tileCache.get(key);
    const [p, x, y, w, h] = sprites[key].rect, result = canvas(w, h);
    context(result).drawImage(spritePages[p], x, y, w, h, 0, 0, w, h);
    tileCache.set(key, result); return result;
  }
  function sprite(g, key, x, y, sx = 1, sy = 1, alpha = 1) {
    const entry = sprites[key];
    if (!entry) throw new Error(`누락된 리소스: ${key}`);
    const { l, r, t, b, flipX, flipY } = entry;
    const image = tile(key), w = image.width, h = image.height;
    const left = x + (flipX ? r : l) * sx, right = x + (flipX ? l : r) * sx;
    const top = y + (flipY ? b : t) * sy, bottom = y + (flipY ? t : b) * sy;
    g.save(); g.globalAlpha *= alpha;
    g.translate(left, top); g.scale((right - left) / w, (bottom - top) / h);
    // A sub-rectangle of a packed atlas can sample its transparent gutter when
    // the 8px white center is stretched30x, producing a dark seam. Drawing an
    // isolated tile makes the browser clamp filtering to that image's edges.
    g.drawImage(image, 0, 0, w, h); g.restore();
  }
  function glyph(code, name, point) {
    let source = name, rect = manifest.fonts[name].glyphs[code], scale = 1;
    if (!rect) { source = 'kr_32'; rect = manifest.fonts.kr_32.glyphs[code]; scale = point / 32; }
    if (!rect) { source = name; rect = manifest.fonts[name].glyphs[63]; scale = 1; }
    return { image: pages[source][rect[0]], rect, scale };
  }
  function bitmapText(text, name, dark = false, outline = 2) {
    const key = JSON.stringify([text, name, dark, outline]);
    if (textCache.has(key)) return textCache.get(key);
    const point = manifest.fonts[name].point;
    const sequence = Array.from(text).map(c => glyph(c.codePointAt(0), name, point));
    const pad = Math.ceil(outline) + 3;
    const width = Math.ceil(sequence.reduce((sum, item) => sum + item.rect[3] * item.scale, 0)) + pad * 2;
    const height = Math.ceil(Math.max(1, ...sequence.map(item => item.rect[4] * item.scale))) + pad * 2;
    const mask = canvas(width, height), mg = context(mask);
    let x = pad;
    for (const { image, rect: [, gx, gy, w, h], scale } of sequence) {
      mg.drawImage(image, gx, gy, w, h, x, pad, w * scale, h * scale); x += w * scale;
    }
    const border = tint(mask, dark ? '#fff' : '#00195f');
    const result = canvas(width, height), g = context(result);
    // Draw an evenly centered outline in sixteen directions.
    for (let i = 0; i < 16; i++) {
      g.drawImage(border, Math.cos(i * Math.PI / 8) * outline, Math.sin(i * Math.PI / 8) * outline);
    }
    if (dark) { const ink = tint(mask, '#000'); g.drawImage(ink, 0, 0); ink.width = 1; }
    else g.drawImage(mask, 0, 0);
    mask.width = 1; border.width = 1;
    const entry = { image: result, bounds: alphaBounds(result) };
    if (textCache.size >= 64) {
      const oldKey = textCache.keys().next().value; textCache.get(oldKey).image.width = 1; textCache.delete(oldKey);
    }
    textCache.set(key, entry); return entry;
  }
  function label(g, text, rect) {
    const { image } = bitmapText(text, 'jp_30', true, 2);
    const factor = Math.min(18 / 30, rect.width / image.width);
    g.drawImage(image, rect.x + (rect.width - image.width * factor) / 2, rect.y + (rect.height - image.height * factor) / 2, image.width * factor, image.height * factor);
  }
  function text(g, value, rect, size, bitmapFont, isTitle) {
    if (!value) return;
    value = value.replace(/[\r\n]/g, ' ');
    if (bitmapFont) {
      const name = isTitle ? 'jp_64' : 'jp_30', point = manifest.fonts[name].point;
      const outlineRadius = isTitle ? 5 : 3.5;
      const { image, bounds } = bitmapText(value, name, false, outlineRadius * point / size);
      const factor = Math.min(size / point, rect.width / image.width, rect.height / bounds.height);
      g.drawImage(image, 0, bounds.y, image.width, bounds.height,
        rect.x + (rect.width - image.width * factor) / 2, rect.y + (rect.height - bounds.height * factor) / 2,
        image.width * factor, bounds.height * factor);
      return;
    }
    // Optional smooth text rendering.
    g.save(); g.font = `${size}px DanSeurat, "Malgun Gothic", sans-serif`;
    const metrics = g.measureText(value);
    const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const factor = Math.min(1, (rect.width - 12) / Math.max(1, metrics.width), (rect.height - 12) / Math.max(1, inkHeight));
    g.translate(rect.x + rect.width / 2, rect.y + rect.height / 2); g.scale(factor, factor);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
    const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeText(value, 0, baseline);
    g.strokeStyle = '#11182f'; g.lineWidth = 3; g.strokeText(value, 0, baseline);
    g.fillStyle = '#fff'; g.fillText(value, 0, baseline); g.restore();
  }
  function digitImage(digit) {
    if (numberCache.has(digit)) return numberCache.get(digit);
    let image;
    if (digit === 0) { const ten = tile('board/25'); image = crop(ten, { x: ten.width / 2, y: 0, width: ten.width / 2, height: ten.height }); }
    else image = tile(`board/${digit === 1 ? 15 : digit + 15}`);
    const trimmed = crop(image, alphaBounds(image)); numberCache.set(digit, trimmed); return trimmed;
  }
  function level(g, value, rect) {
    [...String(value)].forEach((digit, i) => fit(g, digitImage(Number(digit)), { x: rect.x + i * rect.width / 2, y: rect.y, width: rect.width / 2, height: rect.height }));
  }
  const rankSprites = [1, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 24, 25, 26, 28];
  function render(input, scaleOverride = 0) {
    if (disposed) throw new Error('이미지 생성기가 종료되었습니다.');
    const s = validateSettings(input), scale = scaleOverride || s.Scale;
    if (!Number.isInteger(scale) || scale < 1 || scale > 4) throw new RangeError('출력 배율은 1~4입니다.');
    const raw = canvas(1060 * scale, 500 * scale), g = context(raw);
    g.scale(scale, scale); g.translate(530, 290);
    sprite(g, 'board/0', 0, 120); sprite(g, 'board/1', 0, 0); sprite(g, 'board/2', 0, -120);
    sprite(g, 'bottom/16', 0, 120); sprite(g, 'center/31', 0, 0); sprite(g, 'top/16', 0, -120);
    sprite(g, 'board/11', 0, 120, 1, -1, 141 / 256); sprite(g, 'board/12', 0, 0, 1, 29.9988, 141 / 256); sprite(g, 'board/11', 0, -120, 1, 1, 141 / 256);
    const levels = [s.EasyLevel, s.NormalLevel, s.HardLevel, s.Ura ? s.UraLevel : s.OniLevel];
    const boxes = [30, 29, 28, s.Ura ? 27 : 13], labels = ['かんたん', 'ふつう', 'むずかしい', 'おに'];
    for (let d = 0; d < 4; d++) {
      const x = -273 + d * 182, value = levels[d];
      sprite(g, `board/${boxes[d]}`, x, 75); sprite(g, 'board/14', x + 27, 75);
      if (value <= 10) sprite(g, `board/${value === 1 ? 15 : value === 10 ? 25 : value + 15}`, x + 61, 75);
      else level(g, value, { x: x + 37, y: 51, width: 48, height: 48 });
      label(g, labels[d], { x: x - 85, y: 91, width: 84, height: 28 });
    }
    text(g, s.Title, { x: -378, y: -105, width: 756, height: 70 }, s.TitleSize, s.OriginalFont, true);
    text(g, s.Artist, { x: -393, y: -47, width: 786, height: 43 }, s.ArtistSize, s.OriginalFont, false);
    const plate = s.Rank <= 5 ? 0 : s.Rank <= 10 ? 11 : s.Rank <= 15 ? 17 : s.Rank <= 18 ? 23 : 27;
    sprite(g, `balloon/${plate}`, 0, -201); sprite(g, `balloon/${rankSprites[s.Rank - 1]}`, -45, -201);
    sprite(g, `balloon/${s.CourseUra ? 6 : s.Difficulty + 1}`, 44, -201);
    // Rotate after horizontal shear, around the complete raw card's center.
    const angle = s.Angle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle), k = s.Skew / 100;
    const a = cos, b = sin, c = cos * k - sin, d = sin * k + cos;
    const tx = -a * raw.width / 2 - c * raw.height / 2, ty = -b * raw.width / 2 - d * raw.height / 2;
    const points = [[0, 0], [raw.width, 0], [0, raw.height], [raw.width, raw.height]].map(([x, y]) => [a * x + c * y + tx, b * x + d * y + ty]);
    const minX = Math.min(...points.map(p => p[0])), minY = Math.min(...points.map(p => p[1]));
    const maxX = Math.max(...points.map(p => p[0])), maxY = Math.max(...points.map(p => p[1]));
    const output = canvas(Math.ceil(maxX - minX) + 8 * scale, Math.ceil(maxY - minY) + 8 * scale), og = context(output);
    og.setTransform(a, b, c, d, tx + 4 * scale - minX, ty + 4 * scale - minY); og.drawImage(raw, 0, 0);
    const bounds = alphaBounds(output);
    const left = Math.max(0, bounds.x - 3 * scale), top = Math.max(0, bounds.y - 3 * scale);
    const right = Math.min(output.width, bounds.x + bounds.width + 3 * scale), bottom = Math.min(output.height, bounds.y + bounds.height + 3 * scale);
    const result = crop(output, { x: left, y: top, width: right - left, height: bottom - top });
    raw.width = 1; output.width = 1;
    return result;
  }
  function dispose() {
    disposed = true;
    for (const entry of textCache.values()) entry.image.width = 1;
    for (const im of tileCache.values()) im.width = 1;
    for (const im of numberCache.values()) im.width = 1;
    textCache.clear(); tileCache.clear(); numberCache.clear(); document.fonts.delete(smoothFont);
  }
  return { render, dispose, manifest, validateSettings, normalizeSettings };
}
