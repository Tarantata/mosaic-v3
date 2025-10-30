import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

type ExportPayload = {
  source: string;            // URL выбранного изображения (например, /uploads/xxx.png)
  params: { k: number; grid: [number, number] };
  meta?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const data = await req.json().catch(()=>null) as ExportPayload | null;
  if (!data || !data.source || !data.params?.grid) {
    return NextResponse.json({ ok:false, error:"invalid payload" }, { status:400 });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fname = `project-${stamp}.mosaic`;
  const full = path.join(process.cwd(), "public", "exports", fname);
  await writeFile(full, JSON.stringify({ version:1, ...data }, null, 2), "utf-8");
  return NextResponse.json({ ok:true, file:`/exports/${fname}` });
}
