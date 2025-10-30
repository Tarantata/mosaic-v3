"use client";
import { useState } from "react";

export default function UserPanel({
  selected,
  onSetTarget,
}: {
  selected?: { name: string; url: string };
  onSetTarget: (t: { width: number; height: number }) => void;
}) {
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(300);

  return (
    <section className="space-y-3 border rounded p-3">
      <h3 className="font-semibold">User — выбор и размер</h3>

      <div className="text-sm">
        Выбрано:{" "}
        {selected ? (
          <span className="font-mono">{selected.name}</span>
        ) : (
          <span className="text-gray-500">ничего</span>
        )}
      </div>

      <div className="flex gap-3 items-center">
        <label className="text-sm">
          Ширина, мм:
          <input
            type="number"
            className="border px-2 py-1 ml-2 w-24"
            value={width}
            onChange={(e) => setWidth(parseInt(e.target.value || "0") || 0)}
          />
        </label>
        <label className="text-sm">
          Высота, мм:
          <input
            type="number"
            className="border px-2 py-1 ml-2 w-24"
            value={height}
            onChange={(e) => setHeight(parseInt(e.target.value || "0") || 0)}
          />
        </label>

        <button
          className="px-3 py-1 rounded bg-black text-white"
          onClick={() => onSetTarget({ width, height })}
          disabled={!width || !height}
          title="Передать размеры в Admin"
        >
          Применить
        </button>
      </div>

      <div className="text-xs text-gray-500">
        Нажми «Применить», чтобы Admin получил новые размеры.
      </div>
    </section>
  );
}
