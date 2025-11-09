"use client";
import React, { CSSProperties, useEffect, useRef, useState, useCallback } from "react";
import { uniformQuantize } from "@/lib/image/quantize";
import { performOptimization } from "@/lib/image/optimize";

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

  // исходное изображение и «чистая база»
  const imageRef = useRef<HTMLImageElement | null>(null);
  const baseImageDataRef = useRef<ImageData | null>(null);

  // оптимизированные габариты
  const [optDims, setOptDims] = useState<{ width: number; height: number } | null>(null);

  // сегментация: текущее (на экране) и «оригинал» (до оптимизаций)
  const [segReady, setSegReady] = useState(false);
  const [showEdges, setShowEdges] = useState(false);
  const segPaletteRef = useRef<Uint8Array | null>(null);
  const segLabelsRef = useRef<Uint32Array | null>(null);
  const segLabelsOrigRef = useRef<Uint32Array | null>(null);

  // размеры сегментации (могут быть уменьшенными относительно canvas)
  const segDimsRef = useRef<{ w: number; h: number; scale: number } | null>(null);

  // ===== АДАПТИВНЫЕ УРОВНИ (Variant B) =====
  type LevelEntry = {
    L: number;           // уровни на канал
    K: number;           // ~ L^3
    palette: Uint8Array; // палитра
    labels: Uint32Array; // карта бинов (на уменьшенной сетке)
  };
  const [effectiveLevels, setEffectiveLevels] = useState<LevelEntry[]>([]);
  const [effIdx, setEffIdx] = useState(0);
  const [minAreaFactor, setMinAreaFactor] = useState(1.0);

  // фоновая сборка уровней
  const buildingRef = useRef(false);
  const cancelBuildRef = useRef<{ cancel: boolean }>({ cancel: false });

  // requestIdleCallback с фолбэком (без any)
  type IdleDeadline = { timeRemaining: () => number };
  type RequestIdle = (cb: (deadline: IdleDeadline) => void) => number;
  function scheduleIdle(cb: (deadline: IdleDeadline) => void) {
    const w = window as unknown as { requestIdleCallback?: RequestIdle };
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb);
    else setTimeout(() => cb({ timeRemaining: () => 50 }), 0);
  }

  // Быстрое даунскейление ImageData в offscreen canvas
  function getDownscaledImageData(base: ImageData, targetMaxSide = 1024) {
    const srcW = base.width;
    const srcH = base.height;
    const maxSide = Math.max(srcW, srcH);
    const scale = maxSide > targetMaxSide ? targetMaxSide / maxSide : 1;
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    if (scale === 1) {
      return { img: base, w: srcW, h: srcH, scale: 1 };
    }

    const off = document.createElement("canvas");
    off.width = dstW;
    off.height = dstH;
    const offCtx = off.getContext("2d")!;
    // кладём исходный ImageData в временный canvas источника
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    const srcCtx = srcCanvas.getContext("2d")!;
    srcCtx.putImageData(base, 0, 0);

    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = "medium";
    offCtx.drawImage(srcCanvas, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
    const down = offCtx.getImageData(0, 0, dstW, dstH);
    return { img: down, w: dstW, h: dstH, scale };
  }

  // доля отличий (для отбора «полезных» уровней)
  function diffRatio(a: Uint32Array, b: Uint32Array) {
    if (a.length !== b.length) return 1;
    let diff = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) {
      if (a[i] !== b[i]) {
        diff++;
        if (diff > n * 0.01) return diff / n; // ранний выход на 1%
      }
    }
    return diff / n;
  }

  // Фоновая сборка «полезных» уровней на уменьшенной сетке + мгновенный старт
  async function buildEffectiveLevels() {
    if (buildingRef.current) return;
    const base = baseImageDataRef.current;
    if (!base) return;

    buildingRef.current = true;
    cancelBuildRef.current.cancel = false;
    const cancelToken = cancelBuildRef.current;

    // 0) Даунскейлим базу до ~1024 по большей стороне
    const { img: small, w: smallW, h: smallH, scale } = getDownscaledImageData(base, 1024);
    segDimsRef.current = { w: smallW, h: smallH, scale }; // для рендера
    // полезный коэффициент из канваса в «малую» сетку
    const pitchPxFull = HOLE_PITCH_MM * PREVIEW_PX_PER_MM;
    const pitchPxSmall = pitchPxFull * (smallW / (canvasRef.current?.width || smallW));

    // 1) Мгновенный старт — L=4
    const L0 = 4;
    const K0 = L0 * L0 * L0;
    const first = uniformQuantize(small.data, smallW, smallH, K0);

    // применяем сразу
    setEffectiveLevels([{ L: L0, K: K0, palette: first.palette, labels: first.labels }]);
    setEffIdx(0);
    segPaletteRef.current = first.palette;
    segLabelsRef.current = first.labels;
    segLabelsOrigRef.current = first.labels;
    setSegReady(true);
    // быстрый показ
    renderPipeline({ withSegmentation: true });

    // 2) Фоновый добор уровней
    const kept: LevelEntry[] = [{ L: L0, K: K0, palette: first.palette, labels: first.labels }];
    let prev = first.labels;

    const Lmin = 2, Lmax = 16;
    let cur = Lmin;

    const step = () => {
      if (cancelToken.cancel) { buildingRef.current = false; return; }
      if (cur === L0) { cur++; step(); return; }

      scheduleIdle(() => {
        if (cancelToken.cancel) { buildingRef.current = false; return; }
        if (cur > Lmax) {
          setEffectiveLevels(kept);
          buildingRef.current = false;
          return;
        }
        const K = cur * cur * cur;
        const { palette, labels } = uniformQuantize(small.data, smallW, smallH, K);

        const dr = diffRatio(labels, prev);
        if (dr >= 0.01) {
          kept.push({ L: cur, K, palette, labels });
          prev = labels;
        }
        cur++;
        step();
      });
    };
    step();

    // сохраняем на будущее масштаб сетки отверстий в «малой» сетке
    // передадим в optimizator через segDimsRef (рассчитает сам)
    void pitchPxSmall; // подсказка, что переменная учтена в логике (не удаляем)
  }

  // отменяем сборку при размонтировании
  useEffect(() => {
    const token = cancelBuildRef.current; // snapshot
    return () => { token.cancel = true; };
  }, []);

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

    // snapshot чистой базы
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

    // отверстия (шаг 8 мм, диаметр 4 мм)
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

  // ===== РЕНДЕРЫ (масштабированные из «малой» сетки на canvas) =====
  function renderQuantizedScaled(
    palette: Uint8Array,
    labels: Uint32Array,
    smallW: number,
    smallH: number,
    canvas: HTMLCanvasElement
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 1) собираем картинку smallW×smallH
    const smallImage = ctx.createImageData(smallW, smallH);
    const sd = smallImage.data;
    for (let i = 0; i < labels.length; i++) {
      const ci = labels[i];
      const p = i * 4;
      sd[p] = palette[ci * 3];
      sd[p + 1] = palette[ci * 3 + 1];
      sd[p + 2] = palette[ci * 3 + 2];
      sd[p + 3] = 255;
    }
    // 2) кладём на offscreen и растягиваем до размера canvas
    const off = document.createElement("canvas");
    off.width = smallW;
    off.height = smallH;
    const offCtx = off.getContext("2d")!;
    offCtx.putImageData(smallImage, 0, 0);

    ctx.imageSmoothingEnabled = false; // пиксель-арт
    ctx.drawImage(off, 0, 0, smallW, smallH, 0, 0, canvas.width, canvas.height);
  }

  function renderEdgesScaled(
    labels: Uint32Array,
    smallW: number,
    smallH: number,
    canvas: HTMLCanvasElement,
    rgba: [number, number, number, number] = [255, 0, 0, 180]
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1) собираем карту рёбер на «малой» сетке
    const edge = new ImageData(smallW, smallH);
    const ed = edge.data;
    for (let y = 0; y < smallH; y++) {
      const row = y * smallW;
      for (let x = 0; x < smallW; x++) {
        const i = row + x;
        const v = labels[i];
        let boundary = false;
        if (x + 1 < smallW && labels[i + 1] !== v) boundary = true;
        else if (y + 1 < smallH && labels[i + smallW] !== v) boundary = true;
        if (!boundary) continue;
        const p = i * 4;
        ed[p] = rgba[0];
        ed[p + 1] = rgba[1];
        ed[p + 2] = rgba[2];
        ed[p + 3] = rgba[3];
      }
    }
    // 2) рисуем поверх, растягивая до canvas
    const off = document.createElement("canvas");
    off.width = smallW;
    off.height = smallH;
    const offCtx = off.getContext("2d")!;
    offCtx.putImageData(edge, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, smallW, smallH, 0, 0, canvas.width, canvas.height);
  }

  // ===== КНОПКИ РАЗМЕРОВ =====
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
      segPaletteRef.current = null;
      segLabelsRef.current = null;
      segLabelsOrigRef.current = null;
      segDimsRef.current = null;

      drawBaseAndSnapshot(img, w as number, h as number, c);
      // Сборка адаптивных уровней на уменьшенной сетке
      buildEffectiveLevels();
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
      segPaletteRef.current = null;
      segLabelsRef.current = null;
      segLabelsOrigRef.current = null;
      segDimsRef.current = null;

      drawBaseAndSnapshot(img, cw, ch, c);
      buildEffectiveLevels();
      renderPipeline({ withSegmentation: false });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ошибка оптимизации");
    } finally {
      setBusy(false);
    }
  }

  // ===== ОПТИМИЗАЦИЯ СЕГМЕНТАЦИИ (п.3.2 — заменили полностью) =====
  async function optimizeSegments() {
    const c = canvasRef.current;
    const dims = segDimsRef.current;
    if (!c || !baseImageDataRef.current || !segPaletteRef.current || !dims) return;

    setErr("");
    setInfo("");
    setBusy(true);
    try {
      const { w: smallW, h: smallH } = dims;

      // шаг отверстий на «малой» сетке
      const pitchPxFull = HOLE_PITCH_MM * PREVIEW_PX_PER_MM;
      const scaleToSmall = smallW / c.width; // тот же масштаб, что при buildEffectiveLevels
      const pitchPxSmall = Math.max(1, pitchPxFull * scaleToSmall);

      // минимальная площадь на «малой» сетке
      const minPxSmall = Math.max(4, Math.round(minAreaFactor * pitchPxSmall * pitchPxSmall));

      // всегда берём исходную карту (на текущем эффективном уровне)
      const inputLabels = segLabelsOrigRef.current ?? segLabelsRef.current!;
      const newSmallLabels = performOptimization(
        inputLabels,
        smallW,
        smallH,
        minPxSmall,
        segPaletteRef.current,
        pitchPxSmall
      );

      segLabelsRef.current = newSmallLabels;
      setSegReady(true);
      renderPipeline({ withSegmentation: true });

      setInfo(`Оптимизация: коэффициент ×${minAreaFactor.toFixed(2)} • min≈${minPxSmall} (small grid)`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ошибка оптимизации");
    } finally {
      setBusy(false);
    }
  }

  // авто-оптимизация при изменении коэффициента minAreaFactor
  useEffect(() => {
    if (!segReady || !segPaletteRef.current || !(segLabelsRef.current || segLabelsOrigRef.current)) return;
    const id = window.setTimeout(() => { optimizeSegments(); }, 120);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minAreaFactor, effIdx]);

  // общий пайплайн отрисовки
  const renderPipeline = useCallback(({ withSegmentation }: { withSegmentation: boolean }) => {
    const c = canvasRef.current;
    const base = baseImageDataRef.current;
    if (!c || !base) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // чистая база
    ctx.putImageData(base, 0, 0);

    // квантованная картинка (через «малую» сетку -> масштабирование до canvas)
    if (withSegmentation && segPaletteRef.current && segLabelsRef.current && segDimsRef.current) {
      const { w: smallW, h: smallH } = segDimsRef.current;
      renderQuantizedScaled(segPaletteRef.current, segLabelsRef.current, smallW, smallH, c);
    }

    // контуры
    if (withSegmentation && showEdges && segLabelsRef.current && segDimsRef.current) {
      const { w: smallW, h: smallH } = segDimsRef.current;
      renderEdgesScaled(segLabelsRef.current, smallW, smallH, c);
    }

    // сетка — в самом конце
    if (showGrid) drawGridOverlay(c);
  }, [showEdges, showGrid]);
  // Автоперерисовка при смене флагов/готовности
  useEffect(() => {
    renderPipeline({ withSegmentation: segReady });
  }, [renderPipeline, segReady]);


  // подхватываем существующий target в инпуты
  useEffect(() => {
    if (target) {
      setW(Number.isFinite(target.width) ? target.width : "");
      setH(Number.isFinite(target.height) ? target.height : "");
    }
  }, [target]);

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
            <input type="checkbox" checked={showGrid} onChange={(e) => { setShowGrid(e.target.checked); renderPipeline({ withSegmentation: segReady }); }} />
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

      {/* Сегментация (адаптивные уровни) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">Сегментация (адаптивные уровни)</div>
          <label className="flex items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={showEdges}
              onChange={(e) => { setShowEdges(e.target.checked); renderPipeline({ withSegmentation: segReady }); }}
              disabled={!segReady}
            />
            Границы пятен
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Слайдер выбора эффективного уровня */}
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={Math.max(0, effectiveLevels.length - 1)}
              step={1}
              value={effIdx}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setEffIdx(idx);
                const cur = effectiveLevels[idx];
                if (cur) {
                  segPaletteRef.current = cur.palette;
                  segLabelsRef.current = cur.labels;
                  segLabelsOrigRef.current = cur.labels;
                  setSegReady(true);
                  renderPipeline({ withSegmentation: true });
                  // применим текущую оптимизацию (если factor != 1)
                  if (minAreaFactor !== 1.0) {
                    const id = window.setTimeout(() => optimizeSegments(), 60);
                    window.setTimeout(() => clearTimeout(id), 0);
                  }
                }
              }}
              className="w-64"
              disabled={!effectiveLevels.length}
            />
            <div className="text-sm tabular-nums w-48">
              {effectiveLevels.length
                ? <>L = <b>{effectiveLevels[effIdx]?.L}</b> &nbsp;•&nbsp; K ≈ {effectiveLevels[effIdx]?.K}</>
                : "…строю уровни"}
            </div>
          </div>

          {/* Слайдер минимальной площади */}
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">Мин. площадь</label>
            <input
              type="range"
              min={0.25}
              max={10}
              step={0.25}
              value={minAreaFactor}
              onChange={(e) => setMinAreaFactor(Number(e.target.value))}
              className="w-56"
              disabled={!segReady}
              title="Коэффициент к площади клетки (8×8 мм) в пикселях малой сетки"
            />
            <div className="text-sm tabular-nums w-20 text-right">
              × {minAreaFactor.toFixed(2)}
            </div>
          </div>

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