import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import { join } from "path";

const UPLOADS_DIR = join(process.cwd(), "public", "uploads");

// DELETE /api/uploads/:name
export async function DELETE(
  _req: Request,
  context: { params: { name?: string } }
) {
  const name = context.params?.name ?? "";
  // простая защита от traversal
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return NextResponse.json({ error: "invalid name" }, { status: 400 });
  }

  try {
    await unlink(join(UPLOADS_DIR, name));
    return NextResponse.json({ ok: true, name });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
