import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, PolicyPage, PolicySection } from "@/components/legal/PolicyPage";
import { STORE_INFO } from "@/lib/store-info";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Terms that apply to purchases on ${STORE_INFO.storeName}.`,
};

const S = STORE_INFO;

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Service"
      current="/terms"
      intro={`These terms apply to your use of ${S.website.replace("https://", "")} and to every purchase you make from ${S.storeName}, a division of ${S.legalName} ("we", "us"). By using the site or placing an order you agree to them.`}
    >
      <PolicySection title="1. Eligibility">
        <p>
          You must be at least {S.minimumAge} years old and located in the United States to create an account or place an order. You are
          responsible for keeping your account password confidential and for activity under your account.
        </p>
      </PolicySection>

      <PolicySection title="2. Products and information">
        <p>
          We try to describe products, prices and availability accurately, including photos, labels and expiration dates. Product
          packaging and labels may differ slightly from the images shown. Always read the label of the product you receive before use.
        </p>
        <p>
          Product information is provided for general purposes only and is not medical, nutritional or professional advice. Dietary
          supplements and similar products are not intended to diagnose, treat, cure or prevent any disease; consult a healthcare
          professional before use if you have questions.
        </p>
      </PolicySection>

      <PolicySection title="3. Orders and pricing">
        <p>
          Prices are in U.S. dollars. Placing an order is an offer to buy; the order is accepted when we confirm your payment and send
          you an order confirmation. We may refuse or cancel an order — for example, if an item is out of stock, if there is an obvious
          error in price or description, or if we suspect fraud. If we cancel an order you have paid for, we will refund it in full.
        </p>
      </PolicySection>

      <PolicySection title="4. Payment">
        <p>
          Payments are processed by Stripe. We do not see or store your full card number. By paying you confirm you are authorized to
          use the payment method. Applicable sales taxes, if any, are shown at checkout.
        </p>
      </PolicySection>

      <PolicySection title="5. Shipping, returns and refunds">
        <p>
          Shipping is described in our <Link href="/shipping" className="text-hag-accent hover:underline">Shipping Policy</Link>, and
          cancellations, returns and refunds in our{" "}
          <Link href="/returns" className="text-hag-accent hover:underline">Returns &amp; Refunds</Link> policy. Both are part of these
          terms. Risk of loss passes to you when the order is delivered to the shipping address you provided.
        </p>
      </PolicySection>

      <PolicySection title="6. Acceptable use">
        <p>
          Do not misuse the site: no fraudulent orders, no attempts to access other accounts or our systems, and no automated scraping
          or reselling of accounts. We may suspend accounts that break these terms.
        </p>
      </PolicySection>

      <PolicySection title="7. Intellectual property">
        <p>
          The site design, text and our logos belong to {S.legalName}. Product names, brands and images belong to their respective
          owners and are used to identify the products we sell.
        </p>
      </PolicySection>

      <PolicySection title="8. Disclaimers and limitation of liability">
        <p>
          The site is provided &quot;as is&quot;. To the fullest extent allowed by law, we disclaim implied warranties except those that
          cannot be excluded, and our total liability for any claim related to an order is limited to the amount you paid for that
          order. We are not liable for indirect or consequential damages. Nothing in these terms limits rights you have under consumer
          protection laws that cannot be waived.
        </p>
      </PolicySection>

      <PolicySection title="9. Governing law">
        <p>
          These terms are governed by the laws of the State of {S.state}, without regard to its conflict-of-law rules. Before filing
          any claim, please contact us so we can try to resolve the issue informally.
        </p>
      </PolicySection>

      <PolicySection title="10. Changes">
        <p>
          We may update these terms. The version in effect when you place an order applies to that order. The date at the top shows
          when they were last changed.
        </p>
      </PolicySection>

      <PolicySection title="11. Contact">
        <p>
          Questions about these terms: <ContactLine />.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
