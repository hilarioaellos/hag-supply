import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
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

const STATUS_COLOR: Record<string, string> = {
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-800",
  PAYMENT_CONFIRMED: "bg-green-100 text-green-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  SHIPPED: "bg-blue-100 text-blue-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
  OVERSELL_REFUND_PENDING: "bg-orange-100 text-orange-800",
  OVERSELL_REFUND_FAILED: "bg-red-100 text-red-800",
  CANCELLED_REFUNDED: "bg-gray-100 text-gray-800",
};

async function getUserOrders(userId: string) {
  const orders = await db.order.findMany({
    where: { userId },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      total: true,
      status: true,
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return orders;
}

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?redirect=/account/orders");
  }

  const orders = await getUserOrders(session.user.id);

  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-hag-bg flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-4">
          <span className="text-[56px]">📦</span>
          <h1 className="text-[26px] font-bold text-hag-text">No Orders Yet</h1>
          <p className="text-[15px] text-hag-text-2">
            You haven't placed any orders. Start shopping!
          </p>
          <Link href="/" className="mt-2">
            <Button>Start Shopping</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hag-bg">
      <div className="px-12 py-10 max-w-[1100px] mx-auto">
        <div className="mb-8">
          <Link href="/account" className="text-hag-accent hover:text-hag-accent-dark mb-4 inline-block">
            ← Back to Account
          </Link>
          <h1 className="text-[28px] font-bold text-hag-text">Order History</h1>
        </div>

        <div className="bg-white border border-hag-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-hag-border bg-hag-bg">
                  <th className="text-left py-4 px-6 font-semibold text-hag-text-2">
                    Order #
                  </th>
                  <th className="text-left py-4 px-6 font-semibold text-hag-text-2">
                    Date
                  </th>
                  <th className="text-left py-4 px-6 font-semibold text-hag-text-2">
                    Items
                  </th>
                  <th className="text-left py-4 px-6 font-semibold text-hag-text-2">
                    Total
                  </th>
                  <th className="text-left py-4 px-6 font-semibold text-hag-text-2">
                    Status
                  </th>
                  <th className="text-left py-4 px-6 font-semibold text-hag-text-2">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-hag-border hover:bg-hag-bg transition-colors"
                  >
                    <td className="py-4 px-6">
                      <span className="font-semibold text-hag-text">
                        #{order.orderNumber}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-hag-text-2">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-hag-text">
                      {order._count.items} {order._count.items === 1 ? "item" : "items"}
                    </td>
                    <td className="py-4 px-6 font-semibold text-hag-text">
                      ${order.total.toFixed(2)}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`px-3 py-1 rounded-full text-[12px] font-medium ${
                          STATUS_COLOR[order.status] || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {STATUS_LABEL[order.status]}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <Link
                        href={`/order-confirmation/${order.id}`}
                        className="text-[13px] text-hag-accent hover:text-hag-accent-dark font-medium"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
