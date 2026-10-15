import { customAlphabet } from "nanoid";

// Zona horaria de la tienda (envíos desde Florida). Vercel corre en UTC: sin fijarla, el número de orden y
// la fecha mostrada podrían caer en días distintos.
export const STORE_TIME_ZONE = "America/New_York";

// HAG-YYYYMMDD-XXXXXXXX (plan MVP, sección H): 8 caracteres alfanuméricos en mayúscula, 36^8 combinaciones.
const suffix = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 8);

export function generateOrderNumber(now = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TIME_ZONE }).format(now).replace(/-/g, "");
  return `HAG-${date}-${suffix()}`;
}
