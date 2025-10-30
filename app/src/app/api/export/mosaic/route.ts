import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    if (!name) {
      return NextResponse.json({ ok: false, error: "no name" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    const inputPath = path.join(uploadsDir, name);
    if (!fs.existsSync(inputPath)) {
      return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
    }

    const outputDir = path.join(process.cwd(), "public", "exports");
    fs.mkdirSync(outputDir, { recursive: true });

    // создаём простую «заглушку» файла в формате .mosaic
    const outputPath = path.join(outputDir, `${path.parse(name).name}.mosaic`);
    const content = {
      version: "3.0",
      source: name,
      exportedAt: new Date().toISOString(),
    };
    fs.writeFileSync(outputPath, JSON.stringify(content, null, 2));

    return NextResponse.json({ ok: true, file: `/exports/${path.basename(outputPath)}` });
  } catch (e) {
    console.error("Export error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
