import type { Metadata } from "next";
import { ContactLine, PolicyPage, PolicySection } from "@/components/legal/PolicyPage";
import { STORE_INFO } from "@/lib/store-info";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${STORE_INFO.storeName} collects, uses and protects your information.`,
};

const S = STORE_INFO;

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      current="/privacy"
      intro={`This policy explains what information ${S.storeName} (${S.legalName}) collects when you use our store, how we use it, and the choices you have.`}
    >
      <PolicySection title="Information we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong className="text-hag-text">Account information:</strong> your name, email address and password. Passwords are stored
            only in hashed form; we cannot read them.
          </li>
          <li>
            <strong className="text-hag-text">Order information:</strong> the products you buy, your shipping address, order totals and
            order history.
          </li>
          <li>
            <strong className="text-hag-text">Payment information:</strong> payments are handled by Stripe. Your card details go directly
            to Stripe; we only receive limited information such as the payment status.
          </li>
          <li>
            <strong className="text-hag-text">Messages:</strong> what you send us when you contact customer service.
          </li>
          <li>
            <strong className="text-hag-text">Technical information:</strong> basic server logs (such as IP address and browser type)
            kept by our hosting providers for security and troubleshooting.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="How we use it">
        <ul className="list-disc pl-5 space-y-1">
          <li>To process, ship and support your orders, including refunds and returns.</li>
          <li>To send transactional emails, such as order confirmations.</li>
          <li>To run your account and keep your cart.</li>
          <li>To prevent fraud, keep the store secure and comply with legal obligations (for example, tax records).</li>
        </ul>
        <p>We do not send marketing emails, and we do not sell or rent your personal information.</p>
      </PolicySection>

      <PolicySection title="Service providers">
        <p>We share information only with providers that help us run the store, and only as needed for that purpose:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Stripe — payment processing.</li>
          <li>Vercel — website hosting.</li>
          <li>Supabase — database and file storage.</li>
          <li>Resend — sending order emails.</li>
          <li>Cloudflare and Google (Gmail) — receiving and answering the emails you send us, and our internal order notifications.</li>
          <li>Shipping carriers — your name and address, to deliver your order.</li>
        </ul>
        <p>We may also disclose information when required by law or to protect our rights and our customers.</p>
      </PolicySection>

      <PolicySection title="Cookies">
        <p>
          We use only the cookies needed for the store to work, such as the cookie that keeps you signed in. We do not use advertising
          or analytics cookies. Stripe may set its own cookies on the payment form to prevent fraud.
        </p>
      </PolicySection>

      <PolicySection title="How long we keep it">
        <p>
          We keep account information while your account is open. We keep order records, and the emails related to them, for as long as
          needed for accounting, tax and legal purposes, and then delete them. Deleted information may remain for a limited time in
          backup copies kept only to recover from errors: we delete our own backup copies within 90 days, and the backups kept by our
          database provider expire under its retention schedule.
        </p>
      </PolicySection>

      <PolicySection title="Your choices and rights">
        <p>
          You can ask us to access, correct or delete your personal information, or to close your account, by emailing <ContactLine />{" "}
          from the email address on your account (so we can verify it is you). We will respond within 30 days. We may need to keep some
          order records when the law requires it, and we will tell you if that is the case. Depending on your state, you may have additional privacy
          rights; we will honor them as required by law.
        </p>
      </PolicySection>

      <PolicySection title="Security">
        <p>
          We use encrypted connections (HTTPS), hashed passwords and access controls to protect your information. No system is
          completely secure, but we work to protect your data and will notify you if required by law.
        </p>
      </PolicySection>

      <PolicySection title="Children">
        <p>
          Our store is intended for adults. We do not knowingly collect information from children under 13, and you must be{" "}
          {S.minimumAge} or older to place an order.
        </p>
      </PolicySection>

      <PolicySection title="Changes and contact">
        <p>
          We may update this policy; the date at the top shows the latest version. Questions: <ContactLine />.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
