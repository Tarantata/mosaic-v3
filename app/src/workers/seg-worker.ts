// app/src/workers/seg-worker.ts
// Воркера собираем в ESM-режиме; Next/webpack поддерживает new URL(..., import.meta.url).

export type MsgIn =
  | {
      type: "quantize";
      data: Uint8ClampedArray;
      w: number;
      h: number;
      K: number;
    }
  | {
      type: "optimize";
      labels: Uint32Array;
      w: number;
      h: number;
      minPx: number;
      palette: Uint8Array;
      pitch?: number;
    };

export type MsgOut =
  | { type: "quantizeDone"; palette: Uint8Array; labels: Uint32Array }
  | { type: "optimizeDone"; labels: Uint32Array }
  | { type: "error"; message: string };

// Импортируем вашу актуальную логику:
import { uniformQuantize } from "@/lib/image/quantize";
import { performOptimization } from "@/lib/image/optimize";

self.onmessage = (e: MessageEvent<MsgIn>) => {
  const m = e.data;

  try {
    if (m.type === "quantize") {
      const { palette, labels } = uniformQuantize(m.data, m.w, m.h, m.K);
      // Возвращаем как transferable, чтобы не копировать память
      (self as any).postMessage(
        { type: "quantizeDone", palette, labels } as MsgOut,
        [palette.buffer, labels.buffer],
      );
      return;
    }

    if (m.type === "optimize") {
      const out = performOptimization(
        m.labels,
        m.w,
        m.h,
        m.minPx,
        m.palette,
        m.pitch,
      );
      (self as any).postMessage(
        { type: "optimizeDone", labels: out } as MsgOut,
        [out.buffer],
      );
      return;
    }

    (self as any).postMessage({
      type: "error",
      message: "Unknown message type",
    } as MsgOut);
  } catch (err: any) {
    (self as any).postMessage({
      type: "error",
      message: err?.message || String(err),
    } as MsgOut);
  }
};
