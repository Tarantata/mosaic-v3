import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";

export async function GET() {
  const dir = path.join(process.cwd(), "public", "internal-gallery");
  try {
    const files = await readdir(dir);
    const items = await Promise.all(
      files.map(async (name) => {
        const full = path.join(dir, name);
        const s = await stat(full);
        return s.isFile()
          ? { name, url: `/internal-gallery/${name}`, size: s.size, mtime: s.mtime.toISOString() }
          : null;
      })
    );
    return NextResponse.json({ ok: true, items: items.filter(Boolean) });
  } catch {
    return NextResponse.json({ ok: true, items: [] });
  }
}
