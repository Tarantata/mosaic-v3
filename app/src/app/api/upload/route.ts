import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

// Помощник: сохранить один файл
async function saveOne(file: File, destDir: string) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Нормализуем имя (удалим пути, пробелы — по жел.)
  const name = path.basename(file.name).replace(/\s+/g, "_");
  const target = path.join(destDir, name);

  await fs.writeFile(target, buffer);
  return { name, url: `/uploads/${name}`, size: buffer.length };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    // Поддерживаем и files[], и file
    let files: File[] = [];
    const multi = form.getAll("files").filter(Boolean) as File[];
    if (multi.length) {
      files = multi;
    } else {
      const single = form.get("file");
      if (single instanceof File) files = [single];
    }

    if (!files.length) {
      return NextResponse.json({ error: "no files" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const saved = [];
    for (const f of files) {
      // Ограничим типы (по желанию): if (!f.type.startsWith("image/")) continue;
      const meta = await saveOne(f, uploadsDir);
      saved.push(meta);
    }

    return NextResponse.json({ ok: true, saved }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
