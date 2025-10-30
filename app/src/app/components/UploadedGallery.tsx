"use client";
import { useEffect, useState } from "react";

type Item = { name: string; url: string; size: number; mtime: string };

export default function UploadedGallery() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [busyNames, setBusyNames] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/uploads", { cache: "no-store" });
      if (!r.ok) {
        console.error("Failed /api/uploads", r.status, await r.text());
        setItems([]);
        return;
      }
      const j = (await r.json()) as { items?: Item[] };
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (err) {
      console.error("Error fetching /api/uploads:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const clearAll = async () => {
    if (!items.length) return;
    if (!confirm("Удалить все изображения из «Загруженных»?")) return;

    setClearing(true);
    try {
      const res = await fetch("/api/uploads", { method: "DELETE" });
      if (!res.ok) {
        console.error("Failed to clear uploads", res.status, await res.text());
        return;
      }
      await load();
    } finally {
      setClearing(false);
    }
  };

  const deleteOne = async (name: string) => {
    if (!confirm(`Удалить «${name}»?`)) return;

    setBusyNames((m) => ({ ...m, [name]: true }));
    try {
      const res = await fetch(`/api/uploads/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        console.error("Failed to delete", name, res.status, await res.text());
        return;
      }
      setItems((arr) => arr.filter((x) => x.name !== name));
    } finally {
      setBusyNames((m) => {
        const cp = { ...m };
        delete cp[name];
        return cp;
      });
    }
  };

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("reload-uploads", h);
    return () => window.removeEventListener("reload-uploads", h);
  }, []);

  return (
    <section className="p-3 border rounded space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Загруженные</h3>
        <button
          className="text-xs px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
          onClick={clearAll}
          disabled={clearing || loading || items.length === 0}
          title="Удалить все изображения из «Загруженных»"
        >
          {clearing ? "Очищаю…" : "Очистить"}
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="text-sm text-gray-500">Загружаю…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500">Пусто</div>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((it) => {
            const isBusy = !!busyNames[it.name];
            return (
              <figure
                key={it.url}
                className="group relative overflow-hidden rounded-lg border shadow-sm"
                title={it.name}
              >
                <button
                  onClick={() => deleteOne(it.name)}
                  disabled={isBusy}
                  className="absolute right-1 top-1 z-10 rounded-md border bg-white/80 backdrop-blur px-2 py-0.5 text-xs shadow hover:bg-white disabled:opacity-50"
                  title="Удалить этот файл"
                >
                  {isBusy ? "…" : "×"}
                </button>

                <div className="relative w-full aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.url}
                    alt={it.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                <figcaption className="px-2 py-2 text-xs truncate">
                  {it.name}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
}
