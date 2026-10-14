export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { US_STATES } from "@/lib/checkout";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

export default async function CheckoutPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/checkout");

  const items = await db.cartItem.findMany({
    where: { userId: session.user.id },
    include: {
      product: {
        select: {
          name: true,
          price: true,
          media: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
        },
      },
    },
    orderBy: { addedAt: "asc" },
  });
  if (items.length === 0) redirect("/cart");

  // Solo para mostrar: el total que se cobra lo recalcula el servidor en POST /api/checkout.
  const subtotal = items.reduce((sum, i) => sum + Number(i.product.price) * i.quantity, 0);
  const states = Object.entries(US_STATES).map(([code, name]) => ({ code, name }));

  return (
    <div className="min-h-screen bg-hag-bg">
      <div className="px-4 sm:px-6 lg:px-12 py-8 md:py-10 max-w-[1100px] mx-auto">
        <h1 className="text-[24px] md:text-[28px] font-bold text-hag-text mb-6 md:mb-8">Checkout</h1>

        <div className="flex flex-col-reverse lg:flex-row gap-8 lg:gap-10 items-start">
          <div className="w-full flex-1 min-w-0">
            <CheckoutForm states={states} defaultName={session.user.name ?? ""} />
          </div>

          {/* Order summary */}
          <aside className="w-full lg:w-[340px] shrink-0 lg:sticky lg:top-[80px]">
            <div className="bg-white border border-hag-border rounded-2xl p-6 flex flex-col gap-4">
              <h2 className="text-[16px] font-bold text-hag-text">Order Summary</h2>

              <ul className="flex flex-col gap-3">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-hag-bg-alt border border-hag-border">
                      <Image
                        src={item.product.media[0]?.url ?? "/placeholder-product.svg"}
                        alt={item.product.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                    <span className="flex-1 min-w-0 text-[13px] text-hag-text-2 line-clamp-2">
                      {item.product.name} <span className="text-hag-text-3">×{item.quantity}</span>
                    </span>
                    <span className="shrink-0 text-[14px] font-medium text-hag-text">
                      ${(Number(item.product.price) * item.quantity).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-hag-border pt-3 flex flex-col gap-1.5 text-[14px]">
                <div className="flex justify-between text-hag-text-2">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-hag-text-2">
                  <span>Shipping</span>
                  <span>$0.00</span>
                </div>
                <div className="flex justify-between pt-1.5 text-[15px] font-bold text-hag-text">
                  <span>Total</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
