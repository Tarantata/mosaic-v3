import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const GW = process.env.GATEWAY_URL || "http://localhost:9080";
    const body = await req.json();
    const r = await fetch(`${GW}/api/jobs/cells`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    try { return NextResponse.json(JSON.parse(text), { status: r.status }); }
    catch { return new NextResponse(text, { status: r.status }); }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("cluster route error:", msg);
    return NextResponse.json({ ok:false, error:"cluster_route_failed", detail: msg }, { status: 500 });
  }
}
