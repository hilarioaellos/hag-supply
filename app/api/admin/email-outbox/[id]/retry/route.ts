import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { withAdmin } from "@/lib/auth-guards";
import { authOptions } from "@/lib/auth";
import { deliverEmail, requeueFailedEmail } from "@/lib/order-emails";

// POST /api/admin/email-outbox/[id]/retry — HAG-121: reencola un email FAILED y lo intenta enviar enseguida.
export const POST = withAdmin(async (_req: NextRequest, context: unknown) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const session = await getServerSession(authOptions);
  const admin = session?.user?.email ?? "admin";

  const requeued = await requeueFailedEmail(id, admin);
  if (!requeued) {
    return NextResponse.json({ error: "Only FAILED emails can be retried (it may have been retried already)." }, { status: 409 });
  }
  // Intento inmediato; si falla, queda PENDING con su backoff y lo retoman el cron y el webhook.
  const delivery = await deliverEmail(id);
  return NextResponse.json({ requeued: true, delivery });
});
