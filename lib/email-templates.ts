import { STORE_TIME_ZONE } from "@/lib/order-number";

// Plantillas de email (HAG-103). HTML con estilos en línea y tablas, para que se vea bien en Gmail/Outlook,
// más una versión de texto plano. Funciones puras: se renderizan al encolar, dentro de la transacción.

export type ConfirmationEmailData = {
  orderNumber: string;
  orderId: string;
  createdAt: Date;
  buyerName: string;
  items: { name: string; quantity: number; unitPrice: string; total: string; imageUrl: string | null }[];
  subtotal: string;
  shippingCost: string;
  total: string;
  shipping: { name: string; line1: string; line2: string | null; city: string; state: string; zip: string };
};

export type RenderedEmail = { subject: string; html: string; text: string };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const BRAND = "#0b5cad";

export function storeUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "https://supply.hagpartner.com").replace(/\/$/, "");
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${BRAND};padding:20px 28px;">
<span style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">HAG</span>
<span style="font-size:15px;color:#dbe8f6;margin-left:6px;">Supply</span>
</td></tr>
<tr><td style="padding:28px;">${body}</td></tr>
<tr><td style="padding:18px 28px;background:#f9fafb;font-size:12px;color:#6b7280;line-height:1.5;">
HAG Supply — A Division of HAG Partner LLC · Ships from Florida, USA<br>
Questions? Just reply to this email.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function renderOrderConfirmation(d: ConfirmationEmailData): RenderedEmail {
  const date = d.createdAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: STORE_TIME_ZONE });
  const orderUrl = `${storeUrl()}/order-confirmation/${d.orderId}`;
  const firstName = d.buyerName.trim().split(/\s+/)[0] || "there";
  const addressLines = [d.shipping.name, d.shipping.line1, d.shipping.line2, `${d.shipping.city}, ${d.shipping.state} ${d.shipping.zip}`].filter(
    (l): l is string => Boolean(l)
  );

  const rows = d.items
    .map(
      (i) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid #eef0f3;width:56px;vertical-align:top;">${
        i.imageUrl
          ? `<img src="${esc(i.imageUrl)}" width="48" height="48" alt="" style="display:block;border-radius:6px;border:1px solid #e5e7eb;object-fit:cover;">`
          : ""
      }</td>
<td style="padding:10px 8px;border-bottom:1px solid #eef0f3;font-size:14px;vertical-align:top;">${esc(i.name)}<br><span style="color:#6b7280;font-size:13px;">${i.quantity} × $${esc(i.unitPrice)}</span></td>
<td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:14px;text-align:right;vertical-align:top;white-space:nowrap;">$${esc(i.total)}</td>
</tr>`
    )
    .join("");

  const body = `
<h1 style="margin:0 0 8px;font-size:22px;">Thank you for your order, ${esc(firstName)}!</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.5;">Your payment was received and your order is confirmed. We'll pack it and ship it from Florida.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;font-size:14px;">
<tr><td style="color:#6b7280;">Order number</td><td style="text-align:right;font-family:Courier,monospace;font-weight:bold;">${esc(d.orderNumber)}</td></tr>
<tr><td style="color:#6b7280;padding-top:4px;">Date</td><td style="text-align:right;padding-top:4px;">${esc(date)}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:14px;">
<tr><td style="color:#6b7280;">Subtotal</td><td style="text-align:right;">$${esc(d.subtotal)}</td></tr>
<tr><td style="color:#6b7280;padding-top:4px;">Shipping</td><td style="text-align:right;padding-top:4px;">$${esc(d.shippingCost)}</td></tr>
<tr><td style="font-weight:bold;font-size:16px;padding-top:8px;">Total</td><td style="text-align:right;font-weight:bold;font-size:16px;padding-top:8px;">$${esc(d.total)}</td></tr>
</table>
<h2 style="margin:24px 0 6px;font-size:15px;">Shipping to</h2>
<p style="margin:0;font-size:14px;line-height:1.5;color:#374151;">${addressLines.map(esc).join("<br>")}</p>
<p style="margin:26px 0 0;"><a href="${esc(orderUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:bold;">View your order</a></p>
<p style="margin:18px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">We'll email you again when it ships.</p>`;

  const text = [
    `Thank you for your order, ${firstName}!`,
    "Your payment was received and your order is confirmed. We'll pack it and ship it from Florida.",
    "",
    `Order number: ${d.orderNumber}`,
    `Date: ${date}`,
    "",
    ...d.items.map((i) => `- ${i.name} — ${i.quantity} × $${i.unitPrice} = $${i.total}`),
    "",
    `Subtotal: $${d.subtotal}`,
    `Shipping: $${d.shippingCost}`,
    `Total: $${d.total}`,
    "",
    "Shipping to:",
    ...addressLines,
    "",
    `View your order: ${orderUrl}`,
    "",
    "HAG Supply — A Division of HAG Partner LLC. Questions? Just reply to this email.",
  ].join("\n");

  return { subject: `Order confirmed — ${d.orderNumber}`, html: layout(`Order ${d.orderNumber}`, body), text };
}

export function renderAdminAlert(title: string, details: string, orderId?: string | null): RenderedEmail {
  const adminUrl = orderId ? `${storeUrl()}/admin/orders/${orderId}` : `${storeUrl()}/admin`;
  const body = `
<h1 style="margin:0 0 12px;font-size:19px;color:#b42318;">${esc(title)}</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;white-space:pre-line;">${esc(details)}</p>
<p style="margin:0;"><a href="${esc(adminUrl)}" style="color:${BRAND};font-size:14px;">Open in admin</a></p>`;
  return {
    subject: `[HAG Supply] ${title}`,
    html: layout(title, body),
    text: `${title}\n\n${details}\n\nAdmin: ${adminUrl}`,
  };
}

// Aviso al dueño por cada venta nueva (HAG-123). Reutiliza los datos de la confirmación + email del comprador.
export function renderNewOrderNotification(d: ConfirmationEmailData & { buyerEmail: string }): RenderedEmail {
  const date = d.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: STORE_TIME_ZONE });
  const adminUrl = `${storeUrl()}/admin/orders/${d.orderId}`;
  const units = d.items.reduce((n, i) => n + i.quantity, 0);
  const addressLines = [d.shipping.name, d.shipping.line1, d.shipping.line2, `${d.shipping.city}, ${d.shipping.state} ${d.shipping.zip}`].filter(
    (l): l is string => Boolean(l)
  );
  const rows = d.items
    .map(
      (i) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid #eef0f3;font-size:14px;">${esc(i.name)}<br><span style="color:#6b7280;font-size:13px;">${i.quantity} × $${esc(i.unitPrice)}</span></td>
<td style="padding:8px 0;border-bottom:1px solid #eef0f3;font-size:14px;text-align:right;white-space:nowrap;">$${esc(i.total)}</td>
</tr>`
    )
    .join("");
  const body = `
<h1 style="margin:0 0 6px;font-size:21px;">New order: $${esc(d.total)}</h1>
<p style="margin:0 0 18px;font-size:14px;color:#4b5563;">${esc(d.orderNumber)} · ${esc(date)} · ${units} item${units === 1 ? "" : "s"}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;font-size:14px;">
<tr><td style="color:#6b7280;">Customer</td><td style="text-align:right;">${esc(d.buyerName)}</td></tr>
<tr><td style="color:#6b7280;padding-top:4px;">Email</td><td style="text-align:right;padding-top:4px;">${esc(d.buyerEmail)}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;font-size:14px;">
<tr><td style="font-weight:bold;">Total</td><td style="text-align:right;font-weight:bold;">$${esc(d.total)}</td></tr>
</table>
<h2 style="margin:22px 0 6px;font-size:15px;">Ship to</h2>
<p style="margin:0;font-size:14px;line-height:1.5;color:#374151;">${addressLines.map(esc).join("<br>")}</p>
<p style="margin:24px 0 0;"><a href="${esc(adminUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:bold;">Open order in admin</a></p>`;
  const text = [
    `New order: $${d.total}`,
    `${d.orderNumber} · ${date} · ${units} item${units === 1 ? "" : "s"}`,
    "",
    `Customer: ${d.buyerName} <${d.buyerEmail}>`,
    "",
    ...d.items.map((i) => `- ${i.name} — ${i.quantity} × $${i.unitPrice} = $${i.total}`),
    `Total: $${d.total}`,
    "",
    "Ship to:",
    ...addressLines,
    "",
    `Admin: ${adminUrl}`,
  ].join("\n");
  return { subject: `[HAG Supply] New order ${d.orderNumber} — $${d.total}`, html: layout(`New order ${d.orderNumber}`, body), text };
}
