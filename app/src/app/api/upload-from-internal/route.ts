import { NextResponse } from "next/server";
import { mkdir, copyFile, access } from "fs/promises";
import { constants } from "fs";
import { join, basename } from "path";

const ROOT = process.cwd();
const INTERNAL_DIR = join(ROOT, "public", "internal-gallery");
const UPLOADS_DIR  = join(ROOT, "public", "uploads");

export async function POST(req: Request) {
  try {
    const { name } = (await req.json()) as { name?: string };
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const safe = basename(name).replace(/[/\\]+/g, "_");
    const src = join(INTERNAL_DIR, safe);
    const dst = join(UPLOADS_DIR, safe);

    // проверим источник
    await access(src, constants.R_OK);

    // папка приёмника
    await mkdir(UPLOADS_DIR, { recursive: true });

    // копируем
    await copyFile(src, dst);

    return NextResponse.json({ ok: true, name: safe, url: `/uploads/${encodeURIComponent(safe)}` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
