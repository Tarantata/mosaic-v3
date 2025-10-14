"use client";
import { useState } from "react";
import axios from "axios";

type ClusterResp = { ok: boolean; palette?: string[]; stats?: { k?: number } };
type CellsResp   = { ok: boolean; cells?: number; dxf?: string };

export default function Home() {
  const [status, setStatus] = useState("idle");

  const run = async () => {
    try {
      setStatus("running…");
      const clusterRes = await axios.post<ClusterResp>(`/api/cluster`, { k: 16 });
      const cellsRes   = await axios.post<CellsResp>(  `/api/cells`,   { grid: [100, 100] });
      setStatus(`done: palette=${clusterRes.data.stats?.k ?? "?"}, cells=${cellsRes.data.cells ?? "?"}`);
    } catch (e: unknown) {
      let msg = "unknown";
      if (e && typeof e === "object" && "message" in e) msg = String((e as any).message);
      // axios может отдавать тело ошибки:
      // @ts-ignore
      const body = (e as any)?.response?.data ? JSON.stringify((e as any).response.data) : "";
      setStatus(`error: ${msg} ${body}`);
    }
  };

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Mosaic v3 — MVP</h1>
      <button className="mt-4 px-4 py-2 rounded bg-black text-white" onClick={run}>
        Запустить заглушки
      </button>
      <div className="mt-4">{status}</div>
    </main>
  );
}
