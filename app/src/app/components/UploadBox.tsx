"use client";
import { useCallback, useRef, useState } from "react";

export default function UploadBox() {
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "upload failed");

      // Сообщим галерее «Загруженные» обновиться
      window.dispatchEvent(new Event("reload-uploads"));
      setMsg(`Загружено: ${j.name}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setHover(false);
    const f = e.dataTransfer.files?.[0];
    if (f) uploadFile(f);
  }, []);

  const onPickFromDialog = () => inputRef.current?.click();

  const onChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadFile(f);
    e.currentTarget.value = ""; // сбросить, чтобы одно и то же имя можно было повторно выбрать
  };

  return (
    <section className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded p-6 text-center transition
          ${hover ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
      >
        <div className="font-medium">Перетащи файл сюда</div>
        <div className="text-sm text-gray-600 mt-1">или</div>
        <button
          type="button"
          onClick={onPickFromDialog}
          className="mt-2 px-3 py-1 rounded border"
          disabled={busy}
        >
          Выбрать файл…
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onChangeFile}
        />
        {busy && <div className="text-sm text-gray-500 mt-2">Загружаю…</div>}
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>
    </section>
  );
}
