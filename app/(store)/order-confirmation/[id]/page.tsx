export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { reconcileOrderPayment } from "@/lib/checkout";
import { STORE_TIME_ZONE } from "@/lib/order-number";
import { Button } from "@/components/ui/Button";

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pending Payment",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  OVERSELL_REFUND_PENDING: "Refund in Progress",
  OVERSELL_REFUND_FAILED: "Refund Failed",
  CANCELLED_REFUNDED: "Refunded",
};

type Banner = { icon: string; title: string; text: string; tone: "ok" | "wait" | "warn" };

// Encabezado según el estado real de la orden (y del PaymentIntent mientras siga pendiente).
// Los textos de reembolso describen solo lo que ya pasó: en curso, fallido o completado.
function bannerFor(status: OrderStatus, paymentIntentStatus: string | null, buyerEmail: string): Banner {
  switch (status) {
    case "PAYMENT_CONFIRMED":
    case "PROCESSING":
    case "SHIPPED":
    case "DELIVERED":
      return { icon: "✅", tone: "ok", title: "Order Confirmed!", text: "Thank you for your order. We'll pack it and ship it from Florida." };
    case "OVERSELL_REFUND_PENDING":
      return {
        icon: "↩️", tone: "wait", title: "Refund in progress",
        text: "Sorry — an item sold out before your payment went through, so we started a full refund. It hasn't been completed yet; refresh this page later to check its status. Once completed, refunds usually reach your card in 5–10 business days.",
      };
    case "OVERSELL_REFUND_FAILED":
      return {
        icon: "⚠️", tone: "warn", title: "We couldn't refund you automatically",
        text: `Sorry — an item sold out before your payment went through, and our automatic refund couldn't be completed. This order is flagged for our team, who will refund you manually and contact you at ${buyerEmail}. You don't need to do anything.`,
      };
    case "CANCELLED_REFUNDED":
      return {
        icon: "↩️", tone: "warn", title: "Order refunded",
        text: "An item sold out before your payment went through, so we refunded your payment in full. Refunds usually reach your card in 5–10 business days.",
      };
    case "CANCELLED":
      return { icon: "✖️", tone: "warn", title: "Order cancelled", text: "This order was cancelled and you were not charged." };
    case "PENDING_PAYMENT":
      if (paymentIntentStatus === "processing") {
        return { icon: "⏳", tone: "wait", title: "Payment processing", text: "Your payment is being processed. This page will show your confirmation once it completes — refresh in a moment." };
      }
      if (paymentIntentStatus === "requires_payment_method" || paymentIntentStatus === "canceled") {
        return { icon: "⚠️", tone: "warn", title: "Payment not completed", text: "Your payment didn't go through and you were not charged. You can return to checkout and try again." };
      }
      return { icon: "⏳", tone: "wait", title: "Confirming your payment", text: "We're confirming your payment with our payment provider. Refresh this page in a moment." };
  }
}

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/login?redirect=/order-confirmation/${id}`);
  }

  const owner = await db.order.findUnique({ where: { id }, select: { userId: true } });
  if (!owner) notFound();
  if (owner.userId !== session.user.id && session.user.role !== "ADMIN") {
    notFound();
  }

  // Al volver de Stripe la orden puede seguir PENDING_PAYMENT: se reconcilia antes de mostrarla.
  const { paymentIntentStatus } = await reconcileOrderPayment(id);

  const order = await db.order.findUniqueOrThrow({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { slug: true, media: { select: { url: true }, orderBy: { order: "asc" }, take: 1 } } },
        },
      },
    },
  });

  const banner = bannerFor(order.status, paymentIntentStatus, order.buyerEmail);
  const retryable = order.status === "PENDING_PAYMENT" && banner.title === "Payment not completed";

  return (
    <div className="min-h-screen bg-hag-bg">
      <div className="px-4 sm:px-6 lg:px-12 py-8 md:py-10 max-w-[900px] mx-auto">
        <div className="text-center mb-8 md:mb-10">
          <div className="text-[48px] md:text-[56px] mb-3" aria-hidden>{banner.icon}</div>
          <h1 className="text-[26px] md:text-[32px] font-bold text-hag-text mb-2">{banner.title}</h1>
          <p className={`text-[15px] max-w-[560px] mx-auto ${banner.tone === "warn" ? "text-hag-text" : "text-hag-text-2"}`}>
            {banner.text}
          </p>
        </div>

        <div className="bg-white border border-hag-border rounded-2xl p-5 sm:p-8 mb-8 space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-4 sm:gap-8 pb-6 sm:pb-8 border-b border-hag-border">
            <div>
              <p className="text-[12px] text-hag-text-2 font-semibold uppercase tracking-wide">Order Number</p>
              <p className="text-[15px] sm:text-[16px] font-bold text-hag-text mt-1.5 font-mono whitespace-nowrap">{order.orderNumber}</p>
            </div>
            <div>
              <p className="text-[12px] text-hag-text-2 font-semibold uppercase tracking-wide">Date</p>
              <p className="text-[17px] sm:text-[18px] font-bold text-hag-text mt-1.5">
                {order.createdAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: STORE_TIME_ZONE })}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-hag-text-2 font-semibold uppercase tracking-wide">Status</p>
              <p className="text-[17px] sm:text-[18px] font-bold text-hag-text mt-1.5">{STATUS_LABEL[order.status]}</p>
            </div>
          </div>

          <div>
            <h2 className="text-[16px] font-bold text-hag-text mb-4">Items</h2>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-3 sm:gap-4 pb-3 border-b border-hag-border last:border-0">
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden bg-hag-bg-alt border border-hag-border">
                    <Image
                      src={item.product.media[0]?.url ?? "/placeholder-product.svg"}
                      alt={item.productName}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/product/${item.product.slug}`} className="font-semibold text-hag-text hover:text-hag-accent line-clamp-2">
                      {item.productName}
                    </Link>
                    <p className="text-[13px] text-hag-text-2 mt-1">{item.quantity} × ${item.unitPrice.toFixed(2)}</p>
                  </div>
                  <p className="font-semibold text-hag-text shrink-0">${item.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 border-t border-hag-border">
            <div>
              <h2 className="text-[13px] text-hag-text-2 font-semibold uppercase tracking-wide mb-2">Ship to</h2>
              <address className="not-italic text-[14px] text-hag-text leading-relaxed">
                {order.shippingName}
                <br />
                {order.shippingLine1}
                {order.shippingLine2 && (
                  <>
                    <br />
                    {order.shippingLine2}
                  </>
                )}
                <br />
                {order.shippingCity}, {order.shippingState} {order.shippingZip}
              </address>
            </div>
            <div className="sm:text-right flex flex-col gap-1 text-[14px]">
              <div className="flex sm:justify-end justify-between gap-6 text-hag-text-2">
                <span>Subtotal</span>
                <span>${order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex sm:justify-end justify-between gap-6 text-hag-text-2">
                <span>Shipping</span>
                <span>${order.shippingCost.toFixed(2)}</span>
              </div>
              <div className="flex sm:justify-end justify-between gap-6 text-[20px] font-bold text-hag-text mt-1">
                <span>Total</span>
                <span>${order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {banner.tone === "ok" && (
          <p className="text-center text-[14px] text-hag-text-2 mb-6">
            You can follow this order anytime from <Link href="/account/orders" className="text-hag-accent hover:text-hag-accent-dark">My Orders</Link>.
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row justify-center">
          {retryable ? (
            <Link href="/checkout"><Button className="w-full sm:w-auto">Return to Checkout</Button></Link>
          ) : (
            <Link href="/account/orders"><Button variant="secondary" className="w-full sm:w-auto">View All Orders</Button></Link>
          )}
          <Link href="/"><Button variant={retryable ? "secondary" : "primary"} className="w-full sm:w-auto">Continue Shopping</Button></Link>
        </div>
      </div>
    </div>
  );
}
