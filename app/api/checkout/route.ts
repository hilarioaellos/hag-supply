import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { withAuth } from "@/lib/auth-guards";
import { authOptions } from "@/lib/auth";
import { startCheckout, validateShipping } from "@/lib/checkout";

// POST /api/checkout — { shipping } → { orderId, orderNumber, clientSecret, total } | { paid, orderId }
export const POST = withAuth(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const shipping = validateShipping((body as { shipping?: unknown } | null)?.shipping);
  if (!shipping.ok) {
    return NextResponse.json({ error: "Check your shipping address.", fields: shipping.errors }, { status: 400 });
  }

  try {
    const result = await startCheckout(userId, shipping.value);
    switch (result.kind) {
      case "payment":
        return NextResponse.json({
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          clientSecret: result.clientSecret,
          total: result.total,
        });
      case "paid":
        return NextResponse.json({ paid: true, orderId: result.orderId });
      case "error":
        return NextResponse.json({ error: result.message }, { status: result.status });
    }
  } catch (error) {
    console.error("[checkout] error inesperado:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
});
