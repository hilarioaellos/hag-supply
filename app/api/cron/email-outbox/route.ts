import { NextResponse } from "next/server";
import {
  CRON_EMAIL_WINDOW_MS,
  deliverPending,
  getOutboxHealth,
  notifyAdmin,
  requestEmailDeadline,
  withEmailDeadline,
} from "@/lib/order-emails";

// GET /api/cron/email-outbox — reintenta los emails pendientes de la bandeja de salida (HAG-103/122).
// La llama el cron de Vercel (vercel.json, una vez al día en Hobby) y un programador frecuente externo
// (HAG-122). Autenticación: `Authorization: Bearer <CRON_SECRET>`.
//
// Presupuesto (HAG-122): todos los envíos de la petición (lote y aviso de salud) comparten un deadline a los 45 s;
// cada envío se recorta para terminar antes. Los 15 s restantes hasta maxDuration (60 s) son reserva para las
// consultas y la respuesta. El lote termina a los 35 s para dejar ventana al aviso de salud.
export const maxDuration = 60;
const BATCH_BUDGET_MS = 35_000;

export async function GET(req: Request) {
  const emailDeadline = requestEmailDeadline(Date.now(), CRON_EMAIL_WINDOW_MS);
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/email-outbox] falta CRON_SECRET");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { delivered, health } = await withEmailDeadline(emailDeadline, async () => {
    const delivered = await deliverPending({ limit: 500, budgetMs: BATCH_BUDGET_MS });
    const health = await getOutboxHealth();

    // Monitoreo: emails agotados o atrasados → un aviso por día (dedupe por fecha). Si el aviso no se puede
    // persistir, notifyAdmin lanza y el cron responde 500 (queda en los logs de Vercel). Si no queda ventana
    // para enviarlo, queda PENDING y sale en la próxima ejecución.
    if (health.failed > 0 || health.overdue > 0) {
      const day = new Date().toISOString().slice(0, 10);
      await notifyAdmin({
        dedupeKey: `outbox-health:${day}`,
        title: "Emails need attention",
        details: `${health.failed} failed and ${health.overdue} overdue email(s) in the outbox.\nReview them in Admin → Emails and retry the failed ones after fixing the cause.`,
        orderId: null,
      });
    }
    return { delivered, health };
  });

  console.info("[cron/email-outbox]", JSON.stringify({ delivered, health }));
  return NextResponse.json({ ...delivered, health });
}
