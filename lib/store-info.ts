// Datos de la empresa y políticas de la tienda: única fuente para las páginas de Contacto, Envíos,
// Devoluciones, Términos y Privacidad (requisito de Stripe para activar cobros reales).
// Cambiar aquí actualiza todas las páginas a la vez.

export const STORE_INFO = {
  storeName: "HAG Supply",
  legalName: "HAG Partner LLC",
  state: "Florida",
  email: "orders@hagpartner.com",
  // Ubicación pública (ciudad y estado). No se publica el domicilio particular del dueño.
  location: "Delray Beach, FL 33484, USA",
  // Dirección postal comercial (PO Box / buzón de negocio). Pendiente: el dueño la conseguirá; mientras sea
  // null, Contacto no muestra la sección de correo postal.
  mailingAddress: null as string | null,
  website: "https://supply.hagpartner.com",
  // Fecha de vigencia de las políticas (actualizar al cambiar su contenido).
  policiesUpdated: "October 16, 2026",
  minimumAge: 18,
  // Tiempo de respuesta a emails de clientes (Contacto).
  responseTime: "1 business day",
  shipping: {
    processingDays: "1–2 business days",
    deliveryDays: "3–7 business days",
    carriers: "USPS or UPS",
    area: "all 50 U.S. states and Washington, D.C.",
    // Si no se puede despachar a tiempo: aviso al cliente a más tardar el último día del plazo.
    delayNoticeBy: "the end of the promised processing time",
  },
  returns: {
    windowDays: 30,
    // La tienda emite el reembolso en este plazo tras recibir y aprobar la devolución; luego corre el plazo del banco.
    refundIssueDays: "3 business days",
    refundDays: "5–10 business days",
    // Plazo para avisar daños, defectos o errores de envío.
    damageReportDays: 7,
    // Reembolso de una cancelación antes del envío.
    cancelRefundDays: "2 business days",
  },
} as const;

export type PolicyLink = { href: string; label: string };

export const HELP_LINKS: PolicyLink[] = [
  { href: "/contact", label: "Contact Us" },
  { href: "/shipping", label: "Shipping Policy" },
  { href: "/returns", label: "Returns & Refunds" },
];

export const LEGAL_LINKS: PolicyLink[] = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
];
