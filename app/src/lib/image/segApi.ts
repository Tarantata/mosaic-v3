// app/src/lib/image/segApi.ts
import type { MsgIn, MsgOut } from "@/workers/seg-worker";

let _worker: Worker | null = null;
function ensureWorker(): Worker {
  if (_worker) return _worker;
  _worker = new Worker(new URL("@/workers/seg-worker.ts", import.meta.url), { type: "module" });
  return _worker;
}

function callWorker<TOut extends MsgOut>(msg: MsgIn): Promise<TOut> {
  const worker = ensureWorker();
  return new Promise<TOut>((resolve, reject) => {
    const onMessage = (e: MessageEvent<MsgOut>) => {
      const data = e.data;
      if (data.type === "error") {
        cleanup();
        reject(new Error(data.message));
        return;
      }
      if (
        (msg.type === "quantize" && data.type === "quantizeDone") ||
        (msg.type === "optimize" && data.type === "optimizeDone")
      ) {
        cleanup();
        resolve(data as TOut);
      }
    };
    const onError = (err: any) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const cleanup = () => {
      worker.removeEventListener("message", onMessage as any);
      worker.removeEventListener("error", onError as any);
    };

    worker.addEventListener("message", onMessage as any);
    worker.addEventListener("error", onError as any);

    // IMPORTANT: clone buffers before transfer so the caller can reuse originals
    if (msg.type === "quantize") {
      const cloned = new Uint8ClampedArray(msg.data);
      const safe: MsgIn = { type: "quantize", data: cloned, w: msg.w, h: msg.h, K: msg.K };
      worker.postMessage(safe, [cloned.buffer]);
    } else if (msg.type === "optimize") {
      const cloned = new Uint32Array(msg.labels);
      const safe: MsgIn = {
        type: "optimize",
        labels: cloned,
        w: msg.w,
        h: msg.h,
        minPx: msg.minPx,
        palette: msg.palette,
        pitch: msg.pitch,
      };
      worker.postMessage(safe, [cloned.buffer]);
    } else {
      worker.postMessage(msg);
    }
  });
}

export async function uniformQuantize(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  K: number,
): Promise<{ palette: Uint8Array; labels: Uint32Array }> {
  const res = await callWorker<{ type: "quantizeDone"; palette: Uint8Array; labels: Uint32Array }>({
    type: "quantize",
    data: rgba,
    w,
    h,
    K,
  });
  return { palette: res.palette, labels: res.labels };
}

export async function performOptimization(
  labels: Uint32Array,
  w: number,
  h: number,
  minPx: number,
  palette: Uint8Array,
  pitch?: number,
): Promise<Uint32Array> {
  const res = await callWorker<{ type: "optimizeDone"; labels: Uint32Array }>({
    type: "optimize",
    labels,
    w,
    h,
    minPx,
    palette,
    pitch,
  });
  return res.labels;
}
