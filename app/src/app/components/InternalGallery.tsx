"use client";
import { useEffect, useState } from "react";

type Item = { name: string; url: string; size: number; mtime: string };

export default function InternalGallery({
  onPicked,
  onRefreshUploads,
}: {
  onPicked?: (name: string) => void | Promise<void>;
  onRefreshUploads?: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string>("");

  const load = async () => {
    const r = await fetch("/api/internal-gallery", { cache: "no-store" });
    const j = await r.json();
    setItems(Array.isArray(j.items) ? j.items : []);
  };

  useEffect(() => {
    load();
  }, []);

  const handlePick = async (name: string) => {
    try {
      setBusy(name);
      if (onPicked) {
        await onPicked(name); // родитель сделает копирование + setSelected
      }
      onRefreshUploads?.(); // подсказать UploadedGallery обновиться
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="p-3 border rounded space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">Внутренняя галерея</h3>
        <button className="px-3 py-1 border rounded" onClick={load}>
          Обновить
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-gray-500">Пусто</div>
      ) : (
        <div
          className="
            grid gap-3
            grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6
          "
        >
          {items.map((it) => (
            <figure
              key={it.url}
              className="
                group relative overflow-hidden rounded-lg border
                shadow-sm hover:shadow-md transition-shadow
              "
              title={it.name}
            >
              {/* Квадратная карточка с заполняющим изображением */}
              <div className="relative w-full aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.url}
                  alt={it.name}
                  loading="lazy"
                  className="
                    absolute inset-0 w-full h-full object-cover
                    transition-transform duration-200 group-hover:scale-[1.03]
                  "
                />
              </div>

              <figcaption className="flex items-center justify-between gap-2 px-2 py-2">
                <span className="text-xs truncate" title={it.name}>
                  {it.name}
                </span>
                <button
                  className="
                    text-xs px-2 py-1 border rounded
                    hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed
                  "
                  onClick={() => handlePick(it.name)}
                  disabled={busy === it.name}
                  title="Скопировать в «Загруженные» и сделать выбранным"
                >
                  {busy === it.name ? "Обрабатываю…" : "Выбрать"}
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
