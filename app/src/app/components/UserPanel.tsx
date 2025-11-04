"use client";
import { useEffect, useMemo, useState } from "react";

type Target = { width: number; height: number };
type Selected = { name: string; url: string };

export default function UserPanel({
  selected,
  onSetTarget,
}: {
  selected?: Selected;
  onSetTarget?: (t: Target) => void;
}) {
  // локальные инпуты размеров (как в AdminPanel)
  const [w, setW] = useState<number | "">("");
  const [h, setH] = useState<number | "">("");

  // если нужно инициализировать дефолтами — раскомментируй строки ниже
  useEffect(() => {
    // при первом монтировании можно предложить разумные значения
    if (w === "") setW(400);
    if (h === "") setH(300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = useMemo(() => {
    const wn = typeof w === "number" && w > 0;
    const hn = typeof h === "number" && h > 0;
    return wn && hn;
  }, [w, h]);

  const apply = () => {
    if (!valid) return;
    onSetTarget?.({ width: w as number, height: h as number });
    // В режиме User дальше можно авто-стартовать сегментацию (позже добавим)
  };

  return (
    <section className="p-3 border rounded space-y-3">
      <h3 className="font-semibold">Панель Пользователь</h3>

      <div className="text-sm">
        <div className="text-gray-500">Выбранное изображение:</div>
        <div className="truncate">{selected?.name ?? "— не выбрано —"}</div>
      </div>

      {/* Финальные размеры полотна */}
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
              onChange={(e) =>
                setW(e.target.value === "" ? "" : Number(e.target.value))
              }
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
              onChange={(e) =>
                setH(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="mt-1 w-full rounded border px-2 py-1"
              placeholder="например, 600"
            />
          </label>
        </div>

        <button
          className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
          onClick={apply}
          disabled={!valid}
          title="Зафиксировать финальные размеры"
        >
          Применить размеры
        </button>
      </div>
    </section>
  );
}
