import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, PolicyPage, PolicySection } from "@/components/legal/PolicyPage";
import { STORE_INFO } from "@/lib/store-info";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: `Shipping times, costs and coverage for ${STORE_INFO.storeName} orders.`,
};

const { shipping } = STORE_INFO;

export default function ShippingPage() {
  return (
    <PolicyPage title="Shipping Policy" current="/shipping" intro="All orders ship free from Florida, USA.">
      <PolicySection title="Shipping cost">
        <p>Shipping is free on every order. The total you see at checkout is the total you pay.</p>
      </PolicySection>

      <PolicySection title="Where we ship">
        <p>
          We ship to addresses in {shipping.area}. We do not ship internationally or to U.S. territories at this time.
        </p>
      </PolicySection>

      <PolicySection title="Processing and delivery times">
        <p>
          Orders are prepared and shipped within {shipping.processingDays} after payment is confirmed. Orders placed on weekends or
          U.S. holidays are processed the next business day.
        </p>
        <p>
          Once shipped, orders are delivered by {shipping.carriers}, usually within {shipping.deliveryDays}. Delivery times are
          estimates from the carrier and are not guaranteed.
        </p>
      </PolicySection>

      <PolicySection title="If we can't ship on time">
        <p>
          If we cannot ship your order within {shipping.processingDays}, we will email you by {shipping.delayNoticeBy} with a new
          estimated shipping date. You can then choose to wait or to cancel your order for a full, prompt refund. If we cannot ship it
          at all, we will cancel the order and refund you in full.
        </p>
      </PolicySection>

      <PolicySection title="Order updates">
        <p>
          We email you when your order is confirmed. You can check the status of your orders at any time in{" "}
          <Link href="/account/orders" className="text-hag-accent hover:underline">your account</Link>.
        </p>
      </PolicySection>

      <PolicySection title="Address accuracy">
        <p>
          Please check your shipping address before paying. If you notice a mistake, contact us right away: we can correct it
          only before the order ships. We are not responsible for orders delivered to an incorrect address provided at checkout.
        </p>
      </PolicySection>

      <PolicySection title="Lost, late or damaged packages">
        <p>
          If your package has not arrived within 10 business days of shipping, or it arrives damaged, contact us at <ContactLine /> with
          your order number (and photos, for damaged items). We will work with the carrier and, when appropriate, send a
          replacement or issue a refund. See <Link href="/returns" className="text-hag-accent hover:underline">Returns &amp; Refunds</Link>.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
