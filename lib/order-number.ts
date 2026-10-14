import { customAlphabet } from "nanoid";

// HAG-YYYYMMDD-XXXXXXXX (plan MVP, sección H): 8 caracteres alfanuméricos en mayúscula, 36^8 combinaciones.
const suffix = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 8);

export function generateOrderNumber(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `HAG-${date}-${suffix()}`;
}
