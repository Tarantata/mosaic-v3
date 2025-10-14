import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const GW = process.env.GATEWAY_URL || "http://localhost:9080";
  console.log("[cluster] called, GATEWAY_URL=", GW);   // 👈 лог
  const body = await req.json();
  const r = await fetch(`${GW}/api/jobs/cluster`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try { return NextResponse.json(JSON.parse(text), { status: r.status }); }
  catch { return new NextResponse(text, { status: r.status }); }
}
