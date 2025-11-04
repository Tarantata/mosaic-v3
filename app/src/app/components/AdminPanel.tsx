"use client";
import React, { CSSProperties, useEffect, useRef, useState } from "react";

type Target = { width: number; height: number };

// геометрия основы (мм)
const HOLE_DIAM_MM = 4;
const HOLE_PITCH_MM = 8;
const ROW_MM = 16;

// превью
const PREVIEW_PX_PER_MM = 2;
const MAX_CANVAS_SIDE = 16384;

// зум
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;
const ZOOM_STEP = 0.1;

// сегментация (равномерная квантовка)
const DEFAULT_K = 64;     // общее число цветов
const MIN_K = 8;
const MAX_K = 256;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function AdminPanel({
  src,
  target,
  onSetTarget,
}: {
  src?: string;
  target?: Target;
  onSetTarget?: (t: Target) => void;
}) {
  // размеры (мм)
  const [w, setW] = useState<number | "">("");
  const [h, setH] = useState<number | "">("");

  // ui
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // сетка
  const [showGrid, setShowGrid] = useState(false);

  // зум/пан
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // канвас
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelatedStyle: CSSProperties = { imageRendering: "pixelated", background: "#f8fafc" };

  // исходное изображение и «чистая база» после масштабирования/оптимизации
  const imageRef = useRef<HTMLImageElement | null>(null);
  const baseImageDataRef = useRef<ImageData | null>(null);

  // оптимизированные габариты
  const [optDims, setOptDims] = useState<{ width: number; height: number } | null>(null);

  // сегментация (квантовка)
  const [k, setK] = useState(DEFAULT_K);
  const [, setSegBusy] = useState(false);
  const [segReady, setSegReady] = useState(false);
  const [showEdges, setShowEdges] = useState(false);
  const segPaletteRef = useRef<Uint8Array | null>(null);
  const segLabelsRef = useRef<Uint32Array | null>(null);

  // подхватываем существующий target в инпуты
  useEffect(() => {
    if (target) {
      setW(Number.isFinite(target.width) ? target.width : "");
      setH(Number.isFinite(target.height) ? target.height : "");
    }
  }, [target]);

  const hasSrc = !!src;
  const validDims = typeof w === "number" && w > 0 && typeof h === "number" && h > 0;
  const disabledReason = !hasSrc
    ? "Изображение не выбрано"
    : !validDims
    ? "Нужно задать положительные ширину и высоту"
    : busy
    ? "Идёт перерисовка"
    : "";

  // загрузка картинки
  async function ensureImage(): Promise<HTMLImageElement> {
    if (imageRef.current && imageRef.current.src === src) return imageRef.current;
    if (!src) throw new Error("Нет источника изображения");
    const img = new Image();
    img.decoding = "sync";
    img.src = src;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Не удалось загрузить изображение"));
    });
    imageRef.current = img;
    return img;
  }

  // отрисовка базового изображения и snapshot «чистой» базы
  function drawBaseAndSnapshot(
    img: HTMLImageElement,
    widthMm: number,
    heightMm: number,
    canvas: HTMLCanvasElement
  ) {
    setInfo("");
    let cW = Math.max(1, Math.round(widthMm * PREVIEW_PX_PER_MM));
    let cH = Math.max(1, Math.round(heightMm * PREVIEW_PX_PER_MM));
    if (cW > MAX_CANVAS_SIDE || cH > MAX_CANVAS_SIDE) {
      const k = MAX_CANVAS_SIDE / Math.max(cW, cH);
      cW = Math.floor(cW * k);
      cH = Math.floor(cH * k);
      setInfo(
        `Превышение лимита канваса — масштаб уменьшен до ${cW}×${cH}px (эффективно ~${(
          PREVIEW_PX_PER_MM * k
        ).toFixed(3)} px/мм).`
      );
    }
    canvas.width = cW;
    canvas.height = cH;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not available");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cW, cH);
    ctx.drawImage(img, 0, 0, cW, cH);

    // сохраняем «чистую» копию — без сетки и без границ
    baseImageDataRef.current = ctx.getImageData(0, 0, cW, cH);
  }

  // сетка (ряды и отверстия)
  function drawGridOverlay(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pxPerMm = PREVIEW_PX_PER_MM;
    const cw = canvas.width;
    const ch = canvas.height;

    // линии рядов каждые 16 мм
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.round(1 * (window.devicePixelRatio || 1)));
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    const stepRowPx = ROW_MM * pxPerMm;
    for (let x = stepRowPx; x < cw; x += stepRowPx) {
      const X = Math.round(x) + 0.5;
      ctx.beginPath();
      ctx.moveTo(X, 0);
      ctx.lineTo(X, ch);
      ctx.stroke();
    }
    for (let y = stepRowPx; y < ch; y += stepRowPx) {
      const Y = Math.round(y) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, Y);
      ctx.lineTo(cw, Y);
      ctx.stroke();
    }
    ctx.restore();

    // отверстия (шаг 8 мм, диаметр 4 мм), первый центр — 8 мм от краёв
    const pitchPx = HOLE_PITCH_MM * pxPerMm;
    const holeRadiusPx = (HOLE_DIAM_MM / 2) * pxPerMm;
    const startX = pitchPx;
    const startY = pitchPx;

    ctx.save();
    ctx.fillStyle = "rgba(30,30,30,0.85)";
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = Math.max(1, Math.round(0.8 * (window.devicePixelRatio || 1)));
    for (let y = startY; y < ch; y += pitchPx) {
      for (let x = startX; x < cw; x += pitchPx) {
        ctx.beginPath();
        ctx.arc(x, y, holeRadiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ====== РАВНОМЕРНАЯ КВАНТОВКА ======
  // K -> уровни на канал L ≈ cube root
  function levelsForK(total: number) {
    const lv = Math.round(Math.cbrt(total));
    return clamp(lv, 2, 16); // ограничим разумно
  }

  function uniformQuantize(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    totalColors: number
  ) {
    const L = levelsForK(totalColors); // уровни на канал
    const step = 256 / L;

    // быстрая функция "центр корзины" по компоненте
    const binCenter = (v: number) => {
      let b = Math.floor(v / step);
      if (b >= L) b = L - 1;
      const center = Math.round(b * step + step / 2 - 0.5);
      return clamp(center, 0, 255);
    };

    // индекс корзины по трём каналам
    const binIndex = (r: number, g: number, b: number) => {
      const br = Math.floor(r / step);
      const bg = Math.floor(g / step);
      const bb = Math.floor(b / step);
      // компактный индекс
      return br * L * L + bg * L + bb;
    };

    const paletteSize = L * L * L;
    const palette = new Uint8Array(paletteSize * 3);
    const labels = new Uint32Array(width * height);

    // заранее заполним палитру центрами
    for (let br = 0; br < L; br++) {
      for (let bg = 0; bg < L; bg++) {
        for (let bb = 0; bb < L; bb++) {
          const idx = br * L * L + bg * L + bb;
          const r = binCenter(br * step);
          const g = binCenter(bg * step);
          const b = binCenter(bb * step);
          palette[idx * 3] = r;
          palette[idx * 3 + 1] = g;
          palette[idx * 3 + 2] = b;
        }
      }
    }

    // разметка пикселей
    for (let i = 0, p = 0; i < labels.length; i++, p += 4) {
      labels[i] = binIndex(data[p], data[p + 1], data[p + 2]);
    }

    return { palette, labels, L };
  }

  function renderQuantized(
    palette: Uint8Array,
    labels: Uint32Array,
    width: number,
    height: number
  ) {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const out = ctx.createImageData(width, height);
    const od = out.data;
    for (let i = 0; i < labels.length; i++) {
      const ci = labels[i];
      const r = palette[ci * 3];
      const g = palette[ci * 3 + 1];
      const b = palette[ci * 3 + 2];
      const p = i * 4;
      od[p] = r;
      od[p + 1] = g;
      od[p + 2] = b;
      od[p + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }

  // тонкий контур: красим пиксель, если метка отличается с правым/нижним соседом
  function renderEdges(
    labels: Uint32Array,
    width: number,
    height: number,
    rgba: [number, number, number, number] = [255, 0, 0, 180]
  ) {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // соберём карту рёбер
    const edge = new ImageData(width, height);
    const ed = edge.data;

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const i = row + x;
        const v = labels[i];
        let boundary = false;

        if (x + 1 < width && labels[i + 1] !== v) boundary = true;
        else if (y + 1 < height && labels[i + width] !== v) boundary = true;

        if (!boundary) continue;
        const p = i * 4;
        ed[p] = rgba[0];
        ed[p + 1] = rgba[1];
        ed[p + 2] = rgba[2];
        ed[p + 3] = rgba[3];
      }
    }

    // ВАЖНО: класть не через putImageData (оно перезаписывает),
    // а через drawImage с промежуточного канваса — тогда альфа учтётся.
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const offCtx = off.getContext("2d")!;
    offCtx.putImageData(edge, 0, 0);

    ctx.drawImage(off, 0, 0);
  }

  // ===== Оптимизация сегментации: слияние крошек и компонент без отверстий =====

  // Быстрый union-find (слияние областей)
  class UF {
    parent: Uint32Array;
    size: Uint32Array;
    constructor(n: number) {
      this.parent = new Uint32Array(n);
      this.size = new Uint32Array(n);
      for (let i = 0; i < n; i++) { this.parent[i] = i; this.size[i] = 1; }
    }
    find(x: number): number {
      while (this.parent[x] !== x) { this.parent[x] = this.parent[this.parent[x]]; x = this.parent[x]; }
      return x;
    }
    union(a: number, b: number) {
      a = this.find(a); b = this.find(b); if (a === b) return;
      if (this.size[a] < this.size[b]) { const t = a; a = b; b = t; }
      this.parent[b] = a; this.size[a] += this.size[b];
    }
  }

  // Построение связных компонент внутри одного «бина» (labels — это бин квантовки)
  function labelComponents(labels: Uint32Array, w: number, h: number) {
    const comp = new Int32Array(w * h); comp.fill(-1);
    const compLabelBin: number[] = [];
    const compSize: number[] = [];
    let comps = 0;

    const stackX: number[] = [];
    const stackY: number[] = [];
    const idx = (x: number, y: number) => y * w + x;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y);
        if (comp[i] !== -1) continue;
        const bin = labels[i];
        // flood fill 4-связностью по одному bin
        let curSize = 0;
        stackX.length = 0; stackY.length = 0;
        stackX.push(x); stackY.push(y);
        comp[i] = comps;

        while (stackX.length) {
          const cx = stackX.pop()!; const cy = stackY.pop()!;
          curSize++;
          const neighbors = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1],
          ];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = idx(nx, ny);
            if (comp[j] !== -1) continue;
            if (labels[j] !== bin) continue;
            comp[j] = comps;
            stackX.push(nx); stackY.push(ny);
          }
        }
        compLabelBin.push(bin);
        compSize.push(curSize);
        comps++;
      }
    }

    return { comp, compLabelBin, compSize, comps };
  }

  // Соседство компонент (граница в пикселях)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function buildAdjacency(comp: Int32Array, w: number, h: number, _comps: number) {
    const adj = new Map<number, Map<number, number>>(); // a -> (b -> borderPixels)
    const idx = (x: number, y: number) => y * w + x;

    const inc = (a: number, b: number) => {
      if (a === b) return;
      if (!adj.has(a)) adj.set(a, new Map());
      const m = adj.get(a)!;
      m.set(b, (m.get(b) || 0) + 1);
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y); const c = comp[i];
        if (x + 1 < w) { const r = comp[i + 1]; if (r !== c) { inc(c, r); inc(r, c); } }
        if (y + 1 < h) { const d = comp[i + w]; if (d !== c) { inc(c, d); inc(d, c); } }
      }
    }
    return adj;
  }

  // Центры отверстий (через 8 мм) в пикселях превью
  function computeHoleCentersInside(w: number, h: number) {
    const pxPerMm = PREVIEW_PX_PER_MM;
    const pitchPx = HOLE_PITCH_MM * pxPerMm;
    const start = pitchPx; // первый центр на 8 мм от края
    const centers: { x: number; y: number }[] = [];
    for (let y = start; y < h; y += pitchPx) {
      for (let x = start; x < w; x += pitchPx) {
        centers.push({ x: Math.round(x), y: Math.round(y) });
      }
    }
    return centers;
  }

  function componentsWithHole(comp: Int32Array, w: number, h: number, comps: number) {
    const hasHole = new Array<boolean>(comps).fill(false);
    const centers = computeHoleCentersInside(w, h);
    const idx = (x: number, y: number) => y * w + x;

    for (const c of centers) {
      if (c.x < 0 || c.y < 0 || c.x >= w || c.y >= h) continue;
      const id = comp[idx(c.x, c.y)];
      if (id >= 0) hasHole[id] = true;
    }
    return hasHole;
  }

  // ===== performOptimization: слияние крошек и бездырочных компонент + перекраска =====
  function performOptimization(
    labels: Uint32Array,
    w: number,
    h: number,
    minPx: number
  ) {
    // 1) Размечаем компоненты и собираем граф соседств
    const { comp, compLabelBin, compSize, comps } = labelComponents(labels, w, h);
    const adj = buildAdjacency(comp, w, h, comps);
    const hasHole = componentsWithHole(comp, w, h, comps);
    const uf = new UF(comps);

    function bestNeighbor(a: number): number | null {
      const m = adj.get(a) || new Map<number, number>();
      let bestId: number | null = null;
      let bestEdge = -1;
      for (const [b, edge] of m) {
        if (edge > bestEdge) {
          bestEdge = edge;
          bestId = b;
        }
      }
      return bestId;
    }

    // 2) Схлопываем мелкие/«плохие» компоненты в ближайшего сильного соседа
    let changed = true;
    let iter = 0;
    const MAX_ITERS = 5;

    while (changed && iter < MAX_ITERS) {
      changed = false;
      iter++;

      for (let a = 0; a < comps; a++) {
        const sizeA = compSize[a];
        const okArea = sizeA >= minPx;
        const okHole = hasHole[a];

        if (okArea && okHole) continue;

        const nb = bestNeighbor(a);
        if (nb == null) continue;

        uf.union(a, nb);
        changed = true;
      }
    }

    // 3) Перекрашиваем по корням с усреднением цвета
    const remap = new Int32Array(comps);
    for (let a = 0; a < comps; a++) remap[a] = uf.find(a);

    // палитра сегментации: ОДИН раз объявляем pal/bins на всю функцию
    if (!segPaletteRef.current) return labels;
    const pal = segPaletteRef.current as unknown as Uint8Array; // [r,g,b,r,g,b,...]
    const bins = Math.floor(pal.length / 3);

    // суммируем усреднённый цвет по «слепленным» группам
    const sumR = new Float64Array(comps);
    const sumG = new Float64Array(comps);
    const sumB = new Float64Array(comps);
    const count = new Float64Array(comps);

    for (let i = 0; i < labels.length; i++) {
      const cid = comp[i];           // исходная компонента
      const root = remap[cid];       // её корень после union-find
      let bin = compLabelBin[cid];   // исходный bin этой компоненты

      // страховка от выхода за границы
      if (bin < 0) bin = 0;
      if (bin >= bins) bin = bins - 1;

      const base = bin * 3;
      const r0 = pal[base];
      const g0 = pal[base + 1];
      const b0 = pal[base + 2];

      sumR[root] += r0;
      sumG[root] += g0;
      sumB[root] += b0;
      count[root] += 1;
    }

    const avgColor: Array<[number, number, number]> = new Array(comps);
    for (let a = 0; a < comps; a++) {
      if (count[a] > 0) {
        avgColor[a] = [
          sumR[a] / count[a],
          sumG[a] / count[a],
          sumB[a] / count[a],
        ];
      } else {
        avgColor[a] = [0, 0, 0];
      }
    }

    // 4) Переводим пиксели в ближайший цвет палитры (по усреднённому цвету их группы)
    const outLabels = new Uint32Array(labels.length);

    for (let i = 0; i < labels.length; i++) {
      const cid = comp[i];
      const root = remap[cid];
      const [r, g, b] = avgColor[root];

      let best = 0;
      let bestDist = 1e9;

      for (let bidx = 0; bidx < bins; bidx++) {
        const base = bidx * 3;
        const rr = pal[base];
        const gg = pal[base + 1];
        const bb = pal[base + 2];
        const d = (rr - r) ** 2 + (gg - g) ** 2 + (bb - b) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = bidx;
        }
      }

      outLabels[i] = best;
    }

    return outLabels;
  }

  async function optimizeSegments() {
    const c = canvasRef.current;
    if (!c || !baseImageDataRef.current || !segLabelsRef.current || !segPaletteRef.current) return;

    setErr("");
    setInfo("");
    setBusy(true);
    try {
      const w = c.width, h = c.height;

      // «Минимальная площадь»: четверть клетки 8×8 мм в пикселях превью.
      const pitchPx = HOLE_PITCH_MM * PREVIEW_PX_PER_MM; // 8мм * px/мм
      const minPx = Math.max(4, Math.round(1.0 * pitchPx * pitchPx));

      const t0 = performance.now();
      const newLabels = performOptimization(segLabelsRef.current, w, h, minPx);
      const t1 = performance.now();

      segLabelsRef.current = newLabels;
      renderPipeline({ withSegmentation: true });
      setSegReady(true);

      setInfo(`Оптимизация: ${Math.round(t1 - t0)} мс • minPx=${minPx}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ошибка оптимизации");
    } finally {
      setBusy(false);
    }
  }

  // общий пайплайн отрисовки (всегда начинаем с «чистой базы»)
  function renderPipeline({ withSegmentation }: { withSegmentation: boolean }) {
    const c = canvasRef.current;
    const base = baseImageDataRef.current;
    if (!c || !base) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // чистая база
    ctx.putImageData(base, 0, 0);

    // квантованная картинка
    if (withSegmentation && segPaletteRef.current && segLabelsRef.current) {
      renderQuantized(segPaletteRef.current, segLabelsRef.current, c.width, c.height);
    }

    // контуры
    if (withSegmentation && showEdges && segLabelsRef.current) {
      renderEdges(segLabelsRef.current, c.width, c.height);
    }

    // сетка — в самом конце
    if (showGrid) drawGridOverlay(c);
  }

  // КНОПКИ

  async function onApplySizes() {
    if (!hasSrc || !validDims) return;
    setErr("");
    setBusy(true);
    try {
      onSetTarget?.({ width: w as number, height: h as number });
      const img = await ensureImage();
      const c = canvasRef.current!;
      setOptDims(null);
      setSegReady(false);
      segLabelsRef.current = null;
      segPaletteRef.current = null;

      drawBaseAndSnapshot(img, w as number, h as number, c);
      renderPipeline({ withSegmentation: false });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ошибка отрисовки");
    } finally {
      setBusy(false);
    }
  }

  async function onOptimize() {
    if (!hasSrc || !validDims) return;
    setErr("");
    setBusy(true);
    try {
      const img = await ensureImage();
      const c = canvasRef.current!;
      const cw = Math.max(ROW_MM, Math.floor((w as number) / ROW_MM) * ROW_MM);
      const ch = Math.max(ROW_MM, Math.floor((h as number) / ROW_MM) * ROW_MM);
      setOptDims({ width: cw, height: ch });

      setSegReady(false);
      segLabelsRef.current = null;
      segPaletteRef.current = null;

      drawBaseAndSnapshot(img, cw, ch, c);
      renderPipeline({ withSegmentation: false });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ошибка оптимизации");
    } finally {
      setBusy(false);
    }
  }

  async function runSegmentation() {
    const base = baseImageDataRef.current;
    const c = canvasRef.current;
    if (!base || !c) return;

    setSegBusy(true);
    setErr("");
    try {
      const t0 = performance.now();
      const { palette, labels } = uniformQuantize(base.data, base.width, base.height, k);
      const t1 = performance.now();

      segPaletteRef.current = palette;
      segLabelsRef.current = labels;
      setSegReady(true);

      renderPipeline({ withSegmentation: true });
      setInfo(`Сегментация: K≈${k}, ${Math.round(t1 - t0)} мс • ${base.width}×${base.height}px`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ошибка сегментации");
    } finally {
      setSegBusy(false);
    }
  }

  // при изменении K — автообновить, если уже есть база
  useEffect(() => {
    if (!baseImageDataRef.current) return;
    const id = window.setTimeout(() => runSegmentation(), 200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  // переключалки (сетка/границы) — просто перерисовать
  useEffect(() => {
    renderPipeline({ withSegmentation: segReady });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGrid, showEdges, segReady]);

  const finalDims = optDims ?? (validDims ? { width: w as number, height: h as number } : null);

  return (
    <section className="p-3 border rounded space-y-4">
      <h3 className="font-semibold">Панель Админ</h3>

      <div className="text-sm">
        <div className="text-gray-500">Выбранное изображение:</div>
        <div className="truncate">{src ?? "— не выбрано —"}</div>
      </div>

      <div className="space-y-2">
        <div className="font-medium">Финальные размеры мозаики</div>
        <div className="grid grid-cols-2 gap-2 max-w-xs">
          <label className="text-sm">
            Ширина (мм)
            <input
              type="number"
              step="0.1"
              min={0}
              value={w}
              onChange={(e) => setW(e.target.value === "" ? "" : Number(e.target.value))}
              className="mt-1 w-full rounded border px-2 py-1"
              placeholder="например, 800"
            />
          </label>
          <label className="text-sm">
            Высота (мм)
            <input
              type="number"
              step="0.1"
              min={0}
              value={h}
              onChange={(e) => setH(e.target.value === "" ? "" : Number(e.target.value))}
              className="mt-1 w-full rounded border px-2 py-1"
              placeholder="например, 600"
            />
          </label>
        </div>

        <div className="text-xs text-gray-600">
          Плотность превью: <b>{PREVIEW_PX_PER_MM}</b> px/мм (фикс.)
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
            onClick={onApplySizes}
            disabled={!hasSrc || !validDims || busy}
            title={disabledReason || "Построить превью по указанным размерам"}
          >
            {busy ? "Строю…" : "Применить размеры"}
          </button>

          <button
            className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
            onClick={onOptimize}
            disabled={!hasSrc || !validDims || busy}
            title="Подрезать до кратности 16 мм, рассчитать ряды"
          >
            Оптимизировать размеры
          </button>

          <label className="ml-2 flex items-center gap-2 text-sm select-none">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            Показать сетку
          </label>

          <span className="text-xs text-gray-600">
            {finalDims
              ? optDims
                ? `Итог: ${optDims.width}×${optDims.height} мм • Рядов: ${Math.round(
                    optDims.width / ROW_MM
                  )}×${Math.round(optDims.height / ROW_MM)}`
                : `Задано: ${finalDims.width}×${finalDims.height} мм`
              : disabledReason || "—"}
          </span>
        </div>

        {!!err && <div className="text-sm text-red-600">{err}</div>}
        {!!info && <div className="text-xs text-amber-600">{info}</div>}
      </div>

      {/* Сегментация */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">Сегментация (равномерная квантовка)</div>
          <label className="flex items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={showEdges}
              onChange={(e) => setShowEdges(e.target.checked)}
              disabled={!segReady}
            />
            Границы пятен
          </label>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={MIN_K}
            max={MAX_K}
            step={1}
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
            className="w-64"
            disabled={!baseImageDataRef.current}
          />
          <div className="text-sm tabular-nums w-28">K ≈ {k}</div>

          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            onClick={optimizeSegments}
            disabled={!segReady || !baseImageDataRef.current}
            title="Слить крошки и гарантировать хотя бы одну ножку на область"
          >
            Оптимизировать изображение
          </button>
        </div>
      </div>

      {/* канвас + зум/пан */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">Предпросмотр</div>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 border rounded"
              onClick={() => setZoom((z) => clamp(Number((z - ZOOM_STEP).toFixed(2)), ZOOM_MIN, ZOOM_MAX))}
            >
              −
            </button>
            <div className="text-xs w-16 text-center">{Math.round(zoom * 100)}%</div>
            <button
              className="px-2 py-1 border rounded"
              onClick={() => setZoom((z) => clamp(Number((z + ZOOM_STEP).toFixed(2)), ZOOM_MIN, ZOOM_MAX))}
            >
              +
            </button>
            <button className="px-2 py-1 border rounded" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
              100%
            </button>
          </div>
        </div>

        <div
          className="border rounded p-2 overflow-auto max-h-[70vh] relative select-none"
          onWheel={(e) => {
            e.preventDefault();
            const nz = clamp(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), ZOOM_MIN, ZOOM_MAX);
            setZoom(Number(nz.toFixed(2)));
          }}
          onMouseDown={(e) => {
            setDragging(true);
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            panStartRef.current = { ...pan };
          }}
          onMouseMove={(e) => {
            if (!dragging) return;
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;
            setPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
          }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          style={{ cursor: dragging ? "grabbing" : "grab" }}
        >
          <div
            className="inline-block"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            <canvas ref={canvasRef} className="block" style={pixelatedStyle} />
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Отверстия: шаг {HOLE_PITCH_MM} мм, диаметр {HOLE_DIAM_MM} мм; линии рядов каждые {ROW_MM} мм.
        </div>
      </div>
    </section>
  );
}
