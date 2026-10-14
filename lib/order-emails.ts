// Emails transaccionales de órdenes. El envío real con Resend es HAG-103 (HAG-27); mientras tanto
// solo se registra en el log, para que los flujos que ya los llaman (checkout, webhook, admin) no cambien.

export async function sendOrderConfirmation(orderId: string): Promise<void> {
  console.info(`[order-emails] confirmación pendiente de HAG-103 para la orden ${orderId}`);
}

export async function notifyAdminRefundFailed(orderId: string, reason: string): Promise<void> {
  console.error(`[order-emails] REFUND FALLIDO en la orden ${orderId}: ${reason} (aviso por email pendiente de HAG-103)`);
}
