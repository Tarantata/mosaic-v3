// src/lib/image/quantize.ts
// Быстрая равномерная квантовка на L³ бинов + корректный "взвешенный" цвет кластера в CIELAB.
// Сигнатура сохранена: uniformQuantize(rgba, w, h, K) -> { palette: Uint8Array, labels: Uint32Array }

export function uniformQuantize(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  K: number
): { palette: Uint8Array; labels: Uint32Array } {
  const N = w * h;
  if (rgba.length < N * 4) throw new Error("uniformQuantize: bad RGBA size");

  // L³ = K ⇒ L ~ cubic root
  let L = Math.round(Math.pow(Math.max(2, K), 1 / 3));
  L = Math.max(2, Math.min(32, L)); // санитарно: не больше 32 по каналу
  const binsPerChannel = L;
  const binsTotal = binsPerChannel * binsPerChannel * binsPerChannel;

  // Массив меток на каждый пиксель (индекс бина)
  const labels = new Uint32Array(N);

  // Аккумуляторы средних в Lab по каждому бину
  const sumL = new Float32Array(binsTotal);
  const sumA = new Float32Array(binsTotal);
  const sumB = new Float32Array(binsTotal);
  const count = new Uint32Array(binsTotal);

  // 1) Раскладываем пиксели по равномерным бинам RGB и собираем взвешенные суммы в Lab
  let p = 0;
  for (let i = 0; i < N; i++, p += 4) {
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];

    const ri = (r * binsPerChannel) >> 8; // 0..L-1
    const gi = (g * binsPerChannel) >> 8;
    const bi = (b * binsPerChannel) >> 8;
    const bin = ri + gi * binsPerChannel + bi * binsPerChannel * binsPerChannel;
    labels[i] = bin;

    const [LL, AA, BB] = rgbToLabFast(r, g, b);
    sumL[bin] += LL;
    sumA[bin] += AA;
    sumB[bin] += BB;
    count[bin]++;
  }

  // 2) Формируем палитру: среднее Lab -> обратно в sRGB
  const palette = new Uint8Array(binsTotal * 3);
  for (let k = 0; k < binsTotal; k++) {
    if (count[k] === 0) {
      // пустой бин: положим серый
      const base = k * 3;
      palette[base] = 128;
      palette[base + 1] = 128;
      palette[base + 2] = 128;
      continue;
    }
    const inv = 1 / count[k];
    const Lm = sumL[k] * inv;
    const Am = sumA[k] * inv;
    const Bm = sumB[k] * inv;
    const [R, G, B] = labToRgbFast(Lm, Am, Bm);
    const base = k * 3;
    palette[base] = R;
    palette[base + 1] = G;
    palette[base + 2] = B;
  }

  return { palette, labels };
}

// ====== Быстрые конвертеры RGB<->Lab (D65) ======
// Упрощённые/векторизуемые, без зависимостей, с достаточной точностью для квантовки.

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  if (c <= 0.0031308) return Math.round(255 * (12.92 * c));
  return Math.round(255 * (1.055 * Math.pow(c, 1 / 2.4) - 0.055));
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // матрица sRGB D65
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  return [X, Y, Z];
}
function xyzToRgb(X: number, Y: number, Z: number): [number, number, number] {
  // инвертированная матрица D65
  const R = 3.2404542 * X + -1.5371385 * Y + -0.4985314 * Z;
  const G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const B = 0.0556434 * X + -0.2040259 * Y + 1.0572252 * Z;
  return [
    clamp8(linearToSrgb(R)),
    clamp8(linearToSrgb(G)),
    clamp8(linearToSrgb(B)),
  ];
}

function fLab(t: number): number {
  const e = 216 / 24389; // 6^3/29^3
  const k = 24389 / 27;  // 29^3/3^3
  return t > e ? Math.cbrt(t) : (k * t + 16) / 116;
}
function finvLab(t: number): number {
  const e = 216 / 24389;
  const k = 24389 / 27;
  const t3 = t * t * t;
  return t3 > e ? t3 : (116 * t - 16) / k;
}

const Xn = 0.95047; // D65
const Yn = 1.0;
const Zn = 1.08883;

function rgbToLabFast(r: number, g: number, b: number): [number, number, number] {
  const [X, Y, Z] = rgbToXyz(r, g, b);
  const fx = fLab(X / Xn);
  const fy = fLab(Y / Yn);
  const fz = fLab(Z / Zn);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bb = 200 * (fy - fz);
  return [L, a, bb];
}
function labToRgbFast(L: number, a: number, bb: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - bb / 200;
  const X = Xn * finvLab(fx);
  const Y = Yn * finvLab(fy);
  const Z = Zn * finvLab(fz);
  return xyzToRgb(X, Y, Z);
}

function clamp8(x: number): number {
  return x < 0 ? 0 : x > 255 ? 255 : (x | 0);
}
