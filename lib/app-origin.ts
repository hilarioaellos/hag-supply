// Host de esta instalación de la tienda (p. ej. "supply.hagpartner.com" en producción, "localhost:3000" en
// local). Se guarda como metadata.origin en cada PaymentIntent (HAG-124): la cuenta de Stripe de prueba es
// compartida, así que el webhook de producción también recibe los pagos creados por las pruebas locales y
// debe poder distinguirlos.
export function appOrigin(): string {
  const url = process.env.NEXTAUTH_URL ?? "https://supply.hagpartner.com";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
