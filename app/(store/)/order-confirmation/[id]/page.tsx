import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Pending Payment",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  OVERSELL_REFUND_PENDING: "Refund Pending",
  OVERSELL_REFUND_FAILED: "Refund Failed",
  CANCELLED_REFUNDED: "Refunded",
};

export default async function OrderConfirmationPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/login?redirect=/order-confirmation/${params.id}`);
  }

  const order = await db.order.findUnique({
    where: { id: params.id },
    include: {
      items: {
        include: {
          product: { select: { imageUrls: true } },
        },
      },
    },
  });

  if (!order) {
    notFound();
  }

  // Validar ownership: debe ser el dueño o admin
  if (order.userId !== session.user.id && session.user.role !== "ADMIN") {
    notFound();
  }

  return (
    <div className="min-h-screen bg-hag-bg">
      <div className="px-12 py-10 max-w-[900px] mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-[56px] mb-4">✅</div>
          <h1 className="text-[32px] font-bold text-hag-text mb-2">
            Order Confirmed!
          </h1>
          <p className="text-[15px] text-hag-text-2">
            Thank you for your order. We'll notify you when it ships.
          </p>
        </div>

        {/* Order Details */}
        <div className="bg-white border border-hag-border rounded-2xl p-8 mb-8 space-y-8">
          {/* Order Number & Status */}
          <div className="grid grid-cols-3 gap-6 pb-8 border-b border-hag-border">
            <div>
              <p className="text-[13px] text-hag-text-2 font-semibold uppercase tracking-wide">
                Order Number
              </p>
              <p className="text-[20px] font-bold text-hag-text mt-2">
                #{order.orderNumber}
              </p>
            </div>

            <div>
              <p className="text-[13px] text-hag-text-2 font-semibold uppercase tracking-wide">
                Date
              </p>
              <p className="text-[20px] font-bold text-hag-text mt-2">
                {new Date(order.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div>
              <p className="text-[13px] text-hag-text-2 font-semibold uppercase tracking-wide">
                Status
              </p>
              <p className="text-[20px] font-bold text-hag-text mt-2">
                {STATUS_LABEL[order.status]}
              </p>
            </div>
          </div>

          {/* Items */}
          <div>
            <h2 className="text-[16px] font-bold text-hag-text mb-4">
              Order Items
            </h2>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 pb-3 border-b border-hag-border last:border-0"
                >
                  {item.product.imageUrls[0] && (
                    <img
                      src={item.product.imageUrls[0]}
                      alt={item.productName}
                      className="w-16 h-16 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-hag-text">
                      {item.productName}
                    </p>
                    <p className="text-[13px] text-hag-text-2 mt-1">
                      {item.quantity} × ${item.unitPrice.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-hag-text">
                      ${item.total.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Address */}
          {order.shippingName && (
            <div>
              <h2 className="text-[16px] font-bold text-hag-text mb-4">
                Shipping Address
              </h2>
              <div className="text-[14px] text-hag-text space-y-1">
                <p className="font-semibold">{order.shippingName}</p>
                <p>{order.shippingLine1}</p>
                {order.shippingLine2 && <p>{order.shippingLine2}</p>}
                <p>
                  {order.shippingCity}, {order.shippingState} {order.shippingZip}
                </p>
                <p>{order.shippingCountry}</p>
              </div>
            </div>
          )}

          {/* Total */}
          <div className="pt-6 border-t border-hag-border text-right">
            <p className="text-[13px] text-hag-text-2 mb-2">Total</p>
            <p className="text-[32px] font-bold text-hag-text">
              ${order.total.toFixed(2)}
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3 sm:flex-row justify-center">
          <Link href="/account/orders">
            <Button variant="secondary">View All Orders</Button>
          </Link>
          <Link href="/">
            <Button>Continue Shopping</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
