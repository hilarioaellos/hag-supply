import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { CartPageClient } from "./CartPageClient";

async function getCartItems(userId: string) {
  const items = await db.cartItem.findMany({
    where: { userId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          imageUrls: true,
          stock: true,
        },
      },
    },
    orderBy: { addedAt: "asc" },
  });

  return items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    product: {
      ...item.product,
      price: item.product.price.toString(),
    },
  }));
}

export default async function CartPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/cart");

  const items = await getCartItems(session.user.id);

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-hag-bg flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-4">
          <span className="text-[56px]">🛒</span>
          <h1 className="text-[26px] font-bold text-hag-text">Your cart is empty</h1>
          <p className="text-[15px] text-hag-text-2">Add products to get started.</p>
          <Link
            href="/"
            className="mt-2 px-6 py-3 rounded-xl bg-hag-accent text-white text-[15px] font-semibold hover:bg-hag-accent-dark transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  const subtotal = items.reduce(
    (sum, i) => sum + parseFloat(i.product.price) * i.quantity,
    0
  );

  return (
    <div className="min-h-screen bg-hag-bg">
      <div className="px-12 py-10 max-w-[1100px] mx-auto">
        <h1 className="text-[28px] font-bold text-hag-text mb-8">
          Your Cart{" "}
          <span className="text-hag-text-3 font-normal text-[20px]">
            ({items.length} {items.length === 1 ? "item" : "items"})
          </span>
        </h1>

        <div className="flex gap-10 items-start">
          {/* Items list */}
          <CartPageClient items={items} />

          {/* Order summary */}
          <aside className="w-[300px] shrink-0 sticky top-[80px]">
            <div className="bg-white border border-hag-border rounded-2xl p-6 flex flex-col gap-4">
              <h2 className="text-[16px] font-bold text-hag-text">Order Summary</h2>

              <div className="flex flex-col gap-2 text-[14px]">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-hag-text-2">
                    <span className="line-clamp-1 flex-1 mr-2">{item.product.name} ×{item.quantity}</span>
                    <span className="shrink-0 font-medium text-hag-text">
                      ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-hag-border pt-3 flex justify-between text-[15px] font-bold text-hag-text">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>

              <p className="text-[12px] text-hag-text-2">🚚 Free shipping on all orders</p>

              <Link
                href="/checkout"
                className="block w-full py-3.5 rounded-xl bg-hag-accent text-white text-[15px] font-bold text-center hover:bg-hag-accent-dark transition-colors"
              >
                Proceed to Checkout
              </Link>

              <Link
                href="/"
                className="block text-center text-[13px] text-hag-accent hover:text-hag-accent-dark transition-colors"
              >
                ← Continue Shopping
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
