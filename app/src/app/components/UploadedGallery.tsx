"use client";
import { useEffect, useState, useCallback, useRef } from "react";

type Item = { name: string; url: string; size: number; mtime: string };

export default function UploadedGallery({
  onPicked,
}: {
  onPicked?: (item: Item) => void | Promise<void>;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [busyName, setBusyName] = useState<string>("");
  const [busyClear, setBusyClear] = useState<boolean>(false);

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const r = await fetch("/api/uploads", { cache: "no-store" });
      if (!r.ok) {
        setItems([]);
        setError("Не удалось получить список загруженных");
        return;
      }
      const j = await r.json();
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      console.error(e);
      setItems([]);
      setError("Ошибка загрузки списка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("reload-uploads", handler);
    return () => window.removeEventListener("reload-uploads", handler);
  }, [load]);

  const triggerReload = () =>
    window.dispatchEvent(new CustomEvent("reload-uploads"));

  const handlePick = async (it: Item) => {
    try {
      await onPicked?.(it);
    } catch (e) {
      console.error(e);
    }
  };

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    try {
      setUploading(true);
      const fd = new FormData();
      for (const f of files) fd.append("files", f, f.name);

      const r = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        console.error("POST /api/upload failed", r.status, await r.text());
        alert("Не удалось загрузить файлы");
        return;
      }
      await load();
      triggerReload();
    } finally {
      setUploading(false);
      setDragOver(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files ?? []);
    await uploadFiles(files);
  };

  const deleteOne = async (name: string) => {
    try {
      setBusyName(name);
      const r = await fetch(`/api/uploads/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        console.error("DELETE /api/uploads/[name] failed", r.status, await r.text());
        alert("Не удалось удалить файл");
        return;
      }
      await load();
    } finally {
      setBusyName("");
    }
  };

  const clearAll = async () => {
    if (!confirm("Удалить все загруженные изображения?")) return;
    try {
      setBusyClear(true);
      const r = await fetch("/api/uploads", { method: "DELETE" });
      if (!r.ok) {
        console.error("DELETE /api/uploads failed", r.status, await r.text());
        alert("Не удалось очистить галерею");
        return;
      }
      await load();
    } finally {
      setBusyClear(false);
    }
  };

  return (
    <section className="p-3 border rounded space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">Загруженные</h3>
        <button className="px-3 py-1 border rounded" onClick={load} disabled={loading}>
          {loading ? "Обновляю…" : "Обновить"}
        </button>
        <div className="flex-1" />
        <button
          className="px-3 py-1 border rounded text-red-600 disabled:opacity-50"
          onClick={clearAll}
          disabled={busyClear || loading || items.length === 0}
          title="Удалить все изображения"
        >
          {busyClear ? "Очищаю…" : "Очистить всё"}
        </button>
      </div>

      {/* Дропзона/кнопка выбора */}
      <div
        className={`rounded border-2 border-dashed p-4 text-sm flex items-center justify-between gap-3 ${
          dragOver ? "bg-gray-50 border-blue-400" : "border-gray-300"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="text-gray-600">
          Перетащи файлы сюда, или нажми «Выбрать файлы»
          <div className="text-xs text-gray-500">
            Поддерживается множественный выбор
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              await uploadFiles(files);
            }}
          />
          <button
            className="px-3 py-1 border rounded"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Загружаю…" : "Выбрать файлы"}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {items.length === 0 ? (
        <div className="text-sm text-gray-500">Пусто</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map((it) => (
            <figure
              key={it.url}
              className="relative border rounded p-2 cursor-pointer group"
              onClick={() => handlePick(it)}
              title="Выбрать изображение"
            >
              {/* Крестик удаления */}
              <button
                className="absolute right-2 top-2 z-10 rounded-full border bg-white/90 px-2 text-xs leading-5 opacity-0 group-hover:opacity-100 transition disabled:opacity-60"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteOne(it.name);
                }}
                disabled={busyName === it.name}
                title="Удалить"
                aria-label={`Удалить ${it.name}`}
              >
                {busyName === it.name ? "…" : "×"}
              </button>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.url}
                alt={it.name}
                className="w-full rounded object-cover aspect-[4/3]"
                style={{ aspectRatio: "4 / 3" }}
              />

              <div className="mt-1 flex justify-between items-center">
                <span className="text-xs truncate" title={it.name}>
                  {it.name}
                </span>
                <button
                  className="text-xs px-2 py-1 border rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePick(it);
                  }}
                >
                  Выбрать
                </button>
              </div>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
