import { db } from "@/lib/db";

export type ConfirmResult = "confirmed" | "already_processed" | "oversell";

export async function confirmOrder(orderId: string): Promise<ConfirmResult> {
  try {
    await db.$transaction(async (tx) => {
      // PASO 1: Reclamar el estado (cambiar a PAYMENT_CONFIRMED atomicamente)
      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          status: "PENDING_PAYMENT",
        },
        data: { status: "PAYMENT_CONFIRMED" },
      });

      if (updated.count === 0) {
        throw new Error("ALREADY_PROCESSED");
      }

      // PASO 2: Cargar items de la orden
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error("ORDER_NOT_FOUND");
      }

      // PASO 3: Decrementar stock por item
      for (const item of order.items) {
        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: item.quantity },
          },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });

        if (updated.count === 0) {
          throw new Error(`OVERSELL:${item.productId}`);
        }
      }

      // PASO 4: Vaciar carrito del usuario
      await tx.cartItem.deleteMany({
        where: { userId: order.userId },
      });
    });

    return "confirmed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "";

    if (message === "ALREADY_PROCESSED") {
      return "already_processed";
    }

    if (message.startsWith("OVERSELL:")) {
      return "oversell";
    }

    throw err;
  }
}
