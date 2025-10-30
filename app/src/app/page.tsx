"use client";

import { useState } from "react";
import ModeSwitch from "./components/ModeSwitch";
import UserPanel from "./components/UserPanel";
import AdminPanel from "./components/AdminPanel";
import InternalGallery from "./components/InternalGallery";
import UploadedGallery from "./components/UploadedGallery";
import UploadExternal from "./components/UploadExternal";

type Target = { width: number; height: number };
type Selected = { name: string; url: string };

export default function Page() {
  const [mode, setMode] = useState<"user" | "admin">("user");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [target, setTarget] = useState<Target | undefined>();

  const triggerReload = () => {
    window.dispatchEvent(new CustomEvent("reload-uploads"));
  };

  return (
    <main className="space-y-6 p-3">
      <ModeSwitch mode={mode} onMode={setMode} />

      <InternalGallery
        onPicked={async (name: string) => {
          const r = await fetch("/api/upload-from-internal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          if (!r.ok) {
            console.error("upload-from-internal failed", r.status, await r.text());
            alert("Не удалось скопировать в «Загруженные»");
            return;
          }
          setSelected({ name, url: `/uploads/${name}` });
          triggerReload();
        }}
        onRefreshUploads={triggerReload}
      />

      {/* Загрузка внешних файлов */}
      <UploadExternal />

      {/* Загруженные */}
      <UploadedGallery />

      {mode === "user" ? (
        <UserPanel
          selected={selected ?? undefined}
          onSetTarget={(t) => setTarget(t)}
        />
      ) : (
        <AdminPanel src={selected?.url} target={target} />
      )}
    </main>
  );
}
