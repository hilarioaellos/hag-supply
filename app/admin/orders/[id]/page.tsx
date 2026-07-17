import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { OrderStatusSelect } from "@/components/admin/OrderStatusSelect";
import { ConfirmPaymentButton } from "@/components/admin/ConfirmPaymentButton";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  const order = await db.order.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { name: true, email: true } },
      items: {
        include: {
          product: { select: { name: true, imageUrls: true } },
        },
      },
    },
  });

  if (!order) {
    notFound();
  }

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/orders" className="text-hag-accent hover:text-hag-accent-dark">
          ← Back
        </Link>
        <h1 className="text-[24px] font-bold text-hag-text">
          Order #{order.orderNumber}
        </h1>
        <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-[12px] font-medium">
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Order Info */}
        <div className="bg-white border border-hag-border rounded-2xl p-6">
          <h2 className="text-[16px] font-bold text-hag-text mb-4">Order Info</h2>
          <div className="space-y-3 text-[14px]">
            <div>
              <span className="text-hag-text-2">Order Number:</span>
              <p className="font-semibold text-hag-text">#{order.orderNumber}</p>
            </div>
            <div>
              <span className="text-hag-text-2">Date:</span>
              <p className="font-semibold text-hag-text">
                {new Date(order.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <span className="text-hag-text-2">Status:</span>
              <p className="font-semibold text-hag-text">
                {STATUS_LABEL[order.status]}
              </p>
            </div>
            <div>
              <span className="text-hag-text-2">Total:</span>
              <p className="font-semibold text-hag-text text-[16px]">
                ${order.total.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="bg-white border border-hag-border rounded-2xl p-6">
          <h2 className="text-[16px] font-bold text-hag-text mb-4">
            Customer Info
          </h2>
          <div className="space-y-3 text-[14px]">
            <div>
              <span className="text-hag-text-2">Name:</span>
              <p className="font-semibold text-hag-text">
                {order.user?.name || order.buyerName}
              </p>
            </div>
            <div>
              <span className="text-hag-text-2">Email:</span>
              <p className="font-semibold text-hag-text">
                {order.user?.email || order.buyerEmail}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-hag-border rounded-2xl p-6">
        <h2 className="text-[16px] font-bold text-hag-text mb-4">Items</h2>
        <div className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex gap-4 pb-3 border-b border-hag-border last:border-0">
              {item.product.imageUrls[0] && (
                <img
                  src={item.product.imageUrls[0]}
                  alt={item.productName}
                  className="w-12 h-12 rounded object-cover"
                />
              )}
              <div className="flex-1">
                <p className="font-semibold text-hag-text">{item.productName}</p>
                <p className="text-[12px] text-hag-text-2">
                  {item.quantity} × ${item.unitPrice.toFixed(2)}
                </p>
              </div>
              <p className="font-semibold text-hag-text">
                ${item.total.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Shipping Address */}
      {order.shippingName && (
        <div className="bg-white border border-hag-border rounded-2xl p-6">
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

      {/* Status Changes */}
      <div className="bg-white border border-hag-border rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-[16px] font-bold text-hag-text mb-3">Order Status</h2>
          <OrderStatusSelect orderId={order.id} currentStatus={order.status as any} />
        </div>

        {/* Confirm Payment Manually */}
        {order.status === "PENDING_PAYMENT" && order.stripePaymentIntentId && (
          <ConfirmPaymentButton orderId={order.id} />
        )}

        {/* Stripe Payment Intent */}
        {order.stripePaymentIntentId && (
          <div className="pt-4 border-t border-hag-border">
            <p className="text-[13px] text-hag-text-2 mb-2">Stripe Payment Intent:</p>
            <a
              href={`https://dashboard.stripe.com/test/payments/${order.stripePaymentIntentId}`}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-hag-accent hover:text-hag-accent-dark break-all"
            >
              {order.stripePaymentIntentId}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
