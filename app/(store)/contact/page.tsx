import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, PolicyPage, PolicySection } from "@/components/legal/PolicyPage";
import { STORE_INFO } from "@/lib/store-info";

export const metadata: Metadata = {
  title: "Contact Us",
  description: `How to reach ${STORE_INFO.storeName} customer service.`,
};

export default function ContactPage() {
  return (
    <PolicyPage
      title="Contact Us"
      current="/contact"
      showUpdated={false}
      intro="Questions about an order, a product or a return? We're happy to help."
    >
      <PolicySection title="Email">
        <p>
          <ContactLine />
        </p>
        <p>We answer within {STORE_INFO.responseTime} (Monday–Friday). Please include your order number if you have one.</p>
      </PolicySection>

      {STORE_INFO.mailingAddress && (
        <PolicySection title="Mailing address">
          <p className="whitespace-pre-line">
            {STORE_INFO.legalName}
            {"\n"}
            {STORE_INFO.mailingAddress}
          </p>
          <p>This is a mailing address only. To return an item, contact us first so we can send you return instructions.</p>
        </PolicySection>
      )}

      <PolicySection title="Order help">
        <p>
          You can see your orders and their status in <Link href="/account/orders" className="text-hag-accent hover:underline">your account</Link>.
          Before writing to us, you may find your answer in our{" "}
          <Link href="/shipping" className="text-hag-accent hover:underline">Shipping Policy</Link> or{" "}
          <Link href="/returns" className="text-hag-accent hover:underline">Returns &amp; Refunds</Link>.
        </p>
      </PolicySection>

      <PolicySection title="Company">
        <p>
          {STORE_INFO.storeName} is a division of {STORE_INFO.legalName}, a {STORE_INFO.state} limited liability company,
          based in {STORE_INFO.location}.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
