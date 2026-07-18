export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import Link from "next/link";

async function getDashboardStats() {
  const [activeProducts, categories, ordersByStatus, recentOrders, oversellOrders] =
    await Promise.all([
      db.product.count({ where: { deletedAt: null } }),
      db.category.count(),
      db.order.groupBy({
        by: ["status"],
        _count: true,
      }),
      db.order.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
      db.order.findMany({
        where: { status: "OVERSELL_REFUND_FAILED" },
        select: { id: true, orderNumber: true, buyerEmail: true },
      }),
    ]);

  const orders = Object.fromEntries(
    ordersByStatus.map((group: any) => [group.status, group._count])
  ) as Record<string, number>;

  return {
    activeProducts,
    categories,
    orders,
    recentOrders,
    oversellOrders,
  };
}

const STATUS_COLORS: Record<string, string> = {
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

export default async function AdminDashboard() {
  const { activeProducts, categories, orders, recentOrders, oversellOrders } =
    await getDashboardStats();

  return (
    <div className="space-y-8">
      {/* Oversell Alert */}
      {oversellOrders.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div className="flex items-start gap-3">
            <div className="text-[20px]">⚠️</div>
            <div className="flex-1">
              <h3 className="font-bold text-red-900">
                {oversellOrders.length} Order{oversellOrders.length !== 1 ? "s" : ""} with Failed Refunds
              </h3>
              <p className="text-[13px] text-red-700 mt-1">
                Immediate action required for oversold items.
              </p>
              <div className="mt-3 flex gap-2">
                {oversellOrders.slice(0, 3).map((order) => (
                  <Link
                    key={order.id}
                    href={`/admin/orders/${order.id}`}
                    className="text-[12px] px-3 py-1 bg-red-200 hover:bg-red-300 text-red-900 rounded transition-colors"
                  >
                    #{order.orderNumber}
                  </Link>
                ))}
                {oversellOrders.length > 3 && (
                  <span className="text-[12px] text-red-700">
                    +{oversellOrders.length - 3} more
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white border border-hag-border rounded-2xl p-6">
          <div className="text-[13px] text-hag-text-2 font-medium">
            Active Products
          </div>
          <div className="text-[32px] font-bold text-hag-text mt-2">
            {activeProducts}
          </div>
        </div>

        <div className="bg-white border border-hag-border rounded-2xl p-6">
          <div className="text-[13px] text-hag-text-2 font-medium">
            Categories
          </div>
          <div className="text-[32px] font-bold text-hag-text mt-2">
            {categories}
          </div>
        </div>

        <div className="bg-white border border-hag-border rounded-2xl p-6">
          <div className="text-[13px] text-hag-text-2 font-medium">
            Total Orders
          </div>
          <div className="text-[32px] font-bold text-hag-text mt-2">
            {Object.values(orders).reduce((a, b) => a + (b || 0), 0)}
          </div>
        </div>
      </div>

      {/* Order Status Summary */}
      <div className="bg-white border border-hag-border rounded-2xl p-6">
        <h2 className="text-[16px] font-bold text-hag-text mb-4">
          Orders by Status
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(orders).map(([status, count]) => (
            <div
              key={status}
              className="flex justify-between items-center p-3 bg-hag-bg rounded-lg"
            >
              <span className="text-[14px] text-hag-text-2">
                {STATUS_LABEL[status]}
              </span>
              <span className="text-[16px] font-bold text-hag-text">
                {count || 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white border border-hag-border rounded-2xl p-6">
        <h2 className="text-[16px] font-bold text-hag-text mb-6">
          Recent Orders
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-hag-border">
                <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
                  Order #
                </th>
                <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
                  Customer
                </th>
                <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
                  Total
                </th>
                <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
                  Status
                </th>
                <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-hag-text-3">
                    No orders yet
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-hag-border hover:bg-hag-bg transition-colors">
                    <td className="py-3 px-4">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-semibold text-hag-accent hover:text-hag-accent-dark"
                      >
                        #{order.orderNumber}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-hag-text">
                      {order.user?.name || "Unknown"}
                      <div className="text-[12px] text-hag-text-2">
                        {order.user?.email}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-hag-text">
                      ${order.total.toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-[12px] font-medium ${
                          STATUS_COLORS[order.status] ||
                          "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {STATUS_LABEL[order.status]}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-hag-text-2">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
