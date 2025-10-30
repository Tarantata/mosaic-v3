"use client";
import { useCallback, useRef, useState } from "react";

export default function UploadExternal() {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sendFiles = useCallback(async (files: FileList | File[]) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      // кладём все файлы одним ключом "files" (поддерживается в API)
      Array.from(files).forEach((f) => fd.append("files", f));
      const r = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!r.ok) {
        console.error("Upload failed", r.status, await r.text());
        alert("Ошибка загрузки");
        return;
      }
      // подсказать UploadedGallery перечитать
      window.dispatchEvent(new CustomEvent("reload-uploads"));
    } finally {
      setBusy(false);
      // очищаем значение input, чтобы одинаковые файлы можно было выбрать повторно
      if (inputRef.current) inputRef.current.value = "";
    }
  }, []);

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    await sendFiles(e.dataTransfer.files);
  };

  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await sendFiles(e.target.files);
  };

  return (
    <section className="p-3 border rounded space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Загрузка в «Загруженные»</h3>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onSelect}
          />
          <button
            className="text-xs px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            title="Выбрать файлы через диалог"
          >
            {busy ? "Загружаю…" : "Выбрать файлы"}
          </button>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          "rounded-lg border-2 border-dashed p-6 text-center transition",
          dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50",
          busy ? "opacity-60" : "",
        ].join(" ")}
      >
        <div className="text-sm">
          Перетащи сюда изображения<br />
          <span className="text-xs text-gray-500">
            или нажми «Выбрать файлы» сверху справа
          </span>
        </div>
      </div>
    </section>
  );
}
