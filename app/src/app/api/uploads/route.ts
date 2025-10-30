import { NextResponse } from "next/server";
import { mkdir, readdir, stat, unlink, writeFile } from "fs/promises";
import { join, basename } from "path";

const UPLOADS_DIR = join(process.cwd(), "public", "uploads");

// ---------- GET: список ----------
export async function GET() {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const names = await readdir(UPLOADS_DIR);
  const items = await Promise.all(
    names.map(async (name) => {
      const p = join(UPLOADS_DIR, name);
      const s = await stat(p);
      return {
        name,
        url: `/uploads/${encodeURIComponent(name)}`,
        size: s.size,
        mtime: s.mtime.toISOString(),
      };
    })
  );
  items.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return NextResponse.json({ items });
}

// ---------- DELETE: очистить всё ----------
export async function DELETE() {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const names = await readdir(UPLOADS_DIR);
  await Promise.all(names.map((name) => unlink(join(UPLOADS_DIR, name))));
  return NextResponse.json({ ok: true, deleted: names.length });
}

// ---------- POST: загрузка файлов (drag&drop / file picker) ----------
export async function POST(req: Request) {
  try {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const form = await req.formData();

    // поддерживаем и одиночный, и множественный выбор: "file" или "files"
    const entries: File[] = [];
    const f1 = form.get("file");
    if (f1 instanceof File) entries.push(f1);
    const fMany = form.getAll("files");
    for (const it of fMany) if (it instanceof File) entries.push(it);

    if (!entries.length) {
      return NextResponse.json({ error: "no files provided" }, { status: 400 });
    }

    const saved: { name: string; size: number }[] = [];
    for (const file of entries) {
      const mime = file.type || "";
      const okMime = /^image\/(png|jpeg|jpg|webp|gif|bmp|svg\+xml)$/i.test(mime);

      const fileName = (typeof file.name === "string" ? file.name : "upload.bin").trim() || "upload.bin";
      const safeName = basename(fileName).replace(/[/\\]+/g, "_");
      const extOk = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(safeName);
      if (!(okMime || extOk)) {
        return NextResponse.json(
          { error: `unsupported file type: ${mime || safeName}` },
          { status: 415 }
        );
      }

      const maxBytes = 25 * 1024 * 1024;
      if (file.size > maxBytes) {
        return NextResponse.json(
          { error: `file too large: ${safeName}` },
          { status: 413 }
        );
      }

      const arrayBuf = await file.arrayBuffer();
      const dstPath = join(UPLOADS_DIR, safeName);
      await writeFile(dstPath, Buffer.from(arrayBuf));
      saved.push({ name: safeName, size: file.size });
    }
    
    return NextResponse.json({ ok: true, saved });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
