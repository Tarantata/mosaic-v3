import { NextResponse } from "next/server";
import path from "path";
import { writeFile } from "fs/promises";
import crypto from "crypto";

export async function POST(req: Request) {
  const { url }:{url?:string} = await req.json().catch(()=>({}));
  if (!url) return NextResponse.json({ ok:false, error:"url required" }, { status:400 });

  try {
    const r = await fetch(url);
    if (!r.ok) return NextResponse.json({ ok:false, error:`fetch ${r.status}` }, { status:400 });

    const buf = Buffer.from(await r.arrayBuffer());
    const ext = (r.headers.get("content-type")?.includes("png") ? ".png"
                : r.headers.get("content-type")?.includes("jpeg") ? ".jpg"
                : r.headers.get("content-type")?.includes("webp") ? ".webp" : ".bin");
    const name = `ext_${crypto.randomBytes(6).toString("hex")}${ext}`;
    const full = path.join(process.cwd(), "public", "uploads", name);
    await writeFile(full, buf);
    return NextResponse.json({ ok:true, file:`/uploads/${name}` });
  } catch (e) {
    return NextResponse.json({ ok:false, error:String(e) }, { status:500 });
  }
}
