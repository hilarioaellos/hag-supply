import type { Metadata } from "next";
import { ContactLine, PolicyPage, PolicySection } from "@/components/legal/PolicyPage";
import { STORE_INFO } from "@/lib/store-info";

export const metadata: Metadata = {
  title: "Returns & Refunds",
  description: `Return, refund and cancellation policy for ${STORE_INFO.storeName} orders.`,
};

const { returns } = STORE_INFO;

export default function ReturnsPage() {
  return (
    <PolicyPage
      title="Returns & Refunds"
      current="/returns"
      intro={`You can return eligible items within ${returns.windowDays} days of delivery.`}
    >
      <PolicySection title="Order cancellations">
        <p>
          You can cancel an order for a full refund as long as it has not shipped yet. Email us at <ContactLine /> with your order
          number as soon as possible. We will stop the order, confirm the cancellation by email and issue the refund within{" "}
          {returns.cancelRefundDays}. Once an order has shipped it can no longer be cancelled, but it may be returned under this policy.
        </p>
      </PolicySection>

      <PolicySection title="Return window and conditions">
        <p>You may return items within {returns.windowDays} days of the delivery date. To be eligible, an item must be:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Unopened, unused and in its original sealed packaging.</li>
          <li>Not expired.</li>
        </ul>
        <p>
          Because many of our products are consumables (food, beverages, supplements and personal care items), opened items cannot be
          returned for health and safety reasons, unless they arrived damaged, defective or incorrect.
        </p>
      </PolicySection>

      <PolicySection title="Damaged, defective or wrong items">
        <p>
          If your order arrives damaged, defective, expired or is not what you ordered, please contact us within{" "}
          {returns.damageReportDays} days of delivery with your order number and photos of the item and packaging, so we can resolve it
          quickly. We will cover the cost of the return (or ask you to keep or discard the item) and send a replacement or a full
          refund, at your choice. This timeframe does not limit any rights you have under applicable law.
        </p>
      </PolicySection>

      <PolicySection title="How to return an item">
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Email us at <ContactLine /> with your order number and the items you want to return.
          </li>
          <li>We will reply with return instructions and the return address. Please do not send items without contacting us first.</li>
          <li>Ship the items back. For returns that are not due to our error, the return shipping cost is paid by you.</li>
        </ol>
      </PolicySection>

      <PolicySection title="Refunds">
        <p>
          Once we receive and inspect your return, we will email you to confirm whether it was approved. Approved refunds are issued to
          your original payment method within {returns.refundIssueDays} of approval. Depending on your bank, the refund then usually
          appears on your statement within {returns.refundDays}.
        </p>
        <p>
          Original shipping is free, so nothing is deducted for it. Items returned in a condition that does not meet this policy may
          be refused and sent back to you.
        </p>
      </PolicySection>

      <PolicySection title="Questions">
        <p>
          Contact us at <ContactLine />.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
