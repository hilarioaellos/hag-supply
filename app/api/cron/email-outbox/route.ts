import { NextResponse } from "next/server";
import { deliverPending } from "@/lib/order-emails";

// GET /api/cron/email-outbox — Vercel Cron (vercel.json, una vez al día en el plan Hobby). Reintenta los emails
// pendientes de la bandeja de salida. Vercel envía `Authorization: Bearer <CRON_SECRET>`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/email-outbox] falta CRON_SECRET");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await deliverPending({ limit: 50 });
  console.info("[cron/email-outbox]", JSON.stringify(result));
  return NextResponse.json(result);
}
