"use client";
import { useEffect, useRef, useState } from "react";

export default function AdminPanel({
  src,
  target,
}: {
  src?: string;
  target?: { width: number; height: number };
}) {
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>(""); // результат масштабирования (data URL)
  const containerRef = useRef<HTMLDivElement>(null);

  // Масштабирование: src -> canvas(target.w, target.h) -> dataURL
  useEffect(() => {
    const run = async () => {
      setError("");
      setPreviewUrl("");
      if (!src || !target?.width || !target?.height) return;

      try {
        setBusy(true);
        const img = await loadImage(src);
        const { width, height } = target;

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(width));
        canvas.height = Math.max(1, Math.floor(height));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context is not available");

        // Сглаживание (лучше качество)
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const url = canvas.toDataURL("image/png"); // или "image/webp"
        setPreviewUrl(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };
    run();
  }, [src, target]);

  return (
    <section className="space-y-3 border rounded p-3">
      <h3 className="font-semibold">Admin — предпросмотр (масштабирование)</h3>

      <div className="text-sm text-gray-600">
        Источник: {src ? <a href={src} target="_blank" className="text-blue-600 underline">{src}</a> : "не выбрано"}<br/>
        Целевой размер: {target ? `${target.width} × ${target.height}` : "не задан"}
      </div>

      <div className="flex gap-3 items-center">
        <label className="text-sm">
          Zoom:{" "}
          <input
            type="range"
            min={0.1}
            max={5}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
          />
          <span className="ml-2">{zoom.toFixed(1)}×</span>
        </label>

        {previewUrl && (
          <a
            download="scaled-preview.png"
            href={previewUrl}
            className="px-3 py-1 border rounded text-sm"
          >
            Скачать превью
          </a>
        )}
      </div>

      {busy && <div className="text-sm text-gray-500">Масштабирую…</div>}
      {error && <div className="text-sm text-red-600">Ошибка: {error}</div>}

      <div ref={containerRef} className="border rounded overflow-auto" style={{ height: 420 }}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="scaled preview"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left", display: "block" }}
            draggable={false}
          />
        ) : (
          <div className="text-sm text-gray-500 p-4">
            Выбери изображение в «Загруженные» и задай размеры в панели User.
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500">
        Это клиентское масштабирование для предпросмотра. Позже заменим на результат сервиса scaler.
      </div>
    </section>
  );
}

// helper: загрузка изображения как HTMLImageElement
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // если будут внешние URL — может понадобиться CORS
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
    img.src = url;
  });
}
