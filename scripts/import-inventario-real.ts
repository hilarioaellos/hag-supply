// Carga del inventario real (data/inventario-real/productos.json): los agrega a la tienda; los que tienen
// `featured: true` salen en la sección destacada de la home. El resto del catálogo NO se toca.
//
// Uso:
//   npm run inventory:import               → dry-run: solo muestra qué haría
//   npm run inventory:import -- --apply    → carga real
//   npm run inventory:import -- --rollback → oculta los productos que creó esta carga (nada más)
//
// SOLO CREA productos nuevos: nunca modifica un producto que ya exista en la tienda, para no pisar stock
// vendido, precios ni ediciones hechas desde /admin. Un SKU ya publicado es un error; se edita en /admin.
//
// Flujo seguro de --apply:
//   1. Antes de la primera escritura guarda en STATE_FILE qué SKU va a crear (fase "loading").
//   2. Crea esos productos ocultos con deletedAt = NEVER_PUBLISHED, descarga sus imágenes y las sube a Storage.
//   3. Solo si todos terminan bien: en una única transacción los activa a todos juntos (fase "published").
// Si falla en el paso 2, la tienda no cambia y volver a correr --apply retoma la carga.
//
// "Nunca publicado" se comprueba en la base, no solo en STATE_FILE: retomar y activar exigen, dentro del
// mismo UPDATE, deletedAt = NEVER_PUBLISHED. Ocultar un producto ya publicado (--rollback o /admin) pone la
// fecha real, así que nunca se confunde con una carga incompleta y su stock vendido no se repone.
// Tras "published" o "rolled_back" el importador rechaza cualquier --apply de este ciclo.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const db = new PrismaClient();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const BUCKET = "product-media";
// Marca de "creado por el importador y nunca publicado". Ningún otro flujo escribe esta fecha:
// /admin y --rollback ocultan con la fecha actual.
const NEVER_PUBLISHED = new Date("1970-01-01T00:00:00.000Z");
const DATA_DIR = join("data", "inventario-real");
const SOURCE_FILE = join(DATA_DIR, "productos.json");
const STATE_FILE = join(DATA_DIR, "pre-import-state.json");
const IMAGE_HOST = "i.ebayimg.com";
const MAX_SIDE = 1000;

type SourceProduct = {
  sku: string;
  slug: string;
  title: string;
  brand: string;
  category: string;
  condition: string;
  price: number;
  compare_at_price: number | null;
  stock: number;
  upc: string;
  description: string;
  images: string[];
  featured?: boolean;
};
type ImportPhase = "loading" | "published" | "rolled_back";
type ImportState = { createdAt: string; createdSkus: string[]; phase: ImportPhase; updatedAt: string };

function readState(): ImportState | null {
  if (!existsSync(STATE_FILE)) return null;
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  if (!Array.isArray(state.createdSkus) || !["loading", "published", "rolled_back"].includes(state.phase)) {
    throw new Error(`${STATE_FILE} no tiene el formato esperado (createdSkus, phase).`);
  }
  return state;
}

function writeState(state: Omit<ImportState, "updatedAt">) {
  writeFileSync(STATE_FILE, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
}

const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--rollback") ? "rollback" : "dry-run";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Cuadrada con fondo blanco para que las tarjetas (object-cover) no recorten el producto.
async function processImage(input: Buffer): Promise<Buffer> {
  const img = sharp(input).rotate().flatten({ background: "#ffffff" });
  const { width = MAX_SIDE, height = MAX_SIDE } = await img.metadata();
  const side = Math.min(MAX_SIDE, Math.round(Math.max(width, height) * 1.1));
  const inner = Math.round(side / 1.1);
  const resized = await img.resize(inner, inner, { fit: "inside", withoutEnlargement: true }).toBuffer();
  return sharp({ create: { width: side, height: side, channels: 3, background: "#ffffff" } })
    .composite([{ input: resized, gravity: "center" }])
    .webp({ quality: 82 })
    .toBuffer();
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!res.headers.get("content-type")?.startsWith("image/")) throw new Error(`${url}: no es una imagen`);
  return Buffer.from(await res.arrayBuffer());
}

// Oculta solo los productos que creó esta carga. Como la carga nunca modifica productos existentes,
// ocultarlos deja la tienda como estaba. No toca ningún otro producto (ni los ocultados desde /admin).
// También cierra los que quedaron a medio cargar (NEVER_PUBLISHED → fecha real): el ciclo termina y
// ningún --apply posterior puede retomarlos.
async function rollback() {
  const state = readState();
  if (!state) throw new Error(`No existe ${STATE_FILE}; nunca se ejecutó --apply.`);
  const hidden = await db.product.updateMany({
    where: { sku: { in: state.createdSkus }, OR: [{ deletedAt: null }, { deletedAt: NEVER_PUBLISHED }] },
    data: { deletedAt: new Date() },
  });
  writeState({ ...state, phase: "rolled_back" });
  console.log(`Rollback: ${hidden.count} productos del inventario real ocultos; el resto de la tienda sin cambios.`);
}

async function main() {
  if (mode === "rollback") return rollback();

  const source: SourceProduct[] = JSON.parse(readFileSync(SOURCE_FILE, "utf8")).products;
  const skus = source.map((p) => p.sku);

  // ── Validaciones ──────────────────────────────────────────────
  const errors: string[] = [];
  const state = readState();
  const existing = await db.product.findMany({ select: { id: true, sku: true, slug: true, deletedAt: true } });
  const slugOwner = new Map(existing.map((p) => [p.slug, p.sku]));
  const bySku = new Map(existing.map((p) => [p.sku, p]));

  for (const p of source) {
    if (!p.sku) errors.push(`${p.title}: falta sku`);
    if (!p.slug || p.slug !== slugify(p.slug)) errors.push(`${p.sku}: slug inválido "${p.slug}"`);
    if (!p.title || !p.description || !p.category) errors.push(`${p.sku}: falta título, descripción o categoría`);
    if (!(p.price > 0)) errors.push(`${p.sku}: precio inválido`);
    if (p.compare_at_price !== null && !(p.compare_at_price > p.price)) errors.push(`${p.sku}: compare_at_price inválido`);
    if (!Number.isInteger(p.stock) || p.stock < 0) errors.push(`${p.sku}: stock inválido`);
    if (p.images.length === 0) errors.push(`${p.sku}: sin imágenes`);
    if (p.featured !== undefined && typeof p.featured !== "boolean") errors.push(`${p.sku}: featured debe ser true/false`);
    for (const url of p.images) {
      const u = new URL(url);
      if (u.protocol !== "https:" || u.hostname !== IMAGE_HOST) errors.push(`${p.sku}: imagen de origen no permitido ${url}`);
    }
    const owner = slugOwner.get(p.slug);
    if (owner !== undefined && owner !== p.sku) errors.push(`${p.sku}: el slug "${p.slug}" ya lo usa otro producto`);
    // Solo crear: un SKU existente solo se acepta si lo creó un intento anterior de esta carga y nunca se publicó.
    const current = bySku.get(p.sku);
    if (current) {
      if (!state?.createdSkus.includes(p.sku)) errors.push(`${p.sku}: ya existe en la tienda (no lo creó esta carga); edítalo en /admin`);
      else if (current.deletedAt?.getTime() !== NEVER_PUBLISHED.getTime()) {
        errors.push(`${p.sku}: ya se publicó (o se ocultó después de publicarse); edítalo en /admin`);
      }
    }
  }
  if (state && state.phase !== "loading") {
    errors.push(`${STATE_FILE}: esta carga ya terminó (fase "${state.phase}"); no se puede volver a aplicar. Usa /admin.`);
  }
  if (state && [...skus].sort().join() !== [...state.createdSkus].sort().join()) {
    errors.push(`${STATE_FILE}: los SKU del JSON no coinciden con los de la carga en curso (${state.createdSkus.join(", ")}).`);
  }
  for (const list of [skus, source.map((p) => p.slug)]) {
    const dup = list.filter((s, i, a) => a.indexOf(s) !== i);
    if (dup.length) errors.push(`duplicados: ${dup.join(", ")}`);
  }

  const categoryNames = [...new Set(source.map((p) => p.category))];
  const currentCategories = new Map((await db.category.findMany()).map((c) => [c.name, c.id]));
  const newCategories = categoryNames.filter((n) => !currentCategories.has(n));
  const toCreate = source.filter((p) => !bySku.has(p.sku));

  console.log(`Modo: ${mode}`);
  console.log(`Productos a crear: ${toCreate.length} · a retomar (creados ocultos en un intento anterior): ${source.length - toCreate.length}`);
  console.log(`Categorías a crear: ${newCategories.length ? newCategories.join(", ") : "ninguna"}`);
  console.log(`Imágenes a descargar y subir: ${source.reduce((n, p) => n + p.images.length, 0)}`);
  console.log(`Destacados (featured): ${source.filter((p) => p.featured).length}`);
  console.log(`Productos actuales visibles: ${existing.filter((p) => p.deletedAt === null).length} (no se tocan)`);
  if (errors.length) {
    console.log(`\n✗ ${errors.length} errores:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log("✓ Validación OK");
  for (const p of source) {
    console.log(`  ${p.sku} → /product/${p.slug} · $${p.price} · stock ${p.stock} · ${p.images.length} img · ${p.category}${p.featured ? " · featured" : ""}`);
  }
  if (mode === "dry-run") {
    console.log("Dry-run: no se escribió nada. Usa --apply para cargar.");
    return;
  }

  // ── 1. SKU que crea esta carga (solo en la primera ejecución: los reintentos no lo sobrescriben) ──
  if (!state) {
    writeState({ createdAt: new Date().toISOString(), createdSkus: skus, phase: "loading" });
    console.log(`Estado guardado en ${STATE_FILE} (${skus.length} SKU a crear).`);
  } else {
    console.log(`Estado ya existente en ${STATE_FILE}; se conserva (retomando carga).`);
  }

  // ── 2. Carga en oculto ────────────────────────────────────────
  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const category = await db.category.upsert({ where: { name }, create: { name, slug: slugify(name) }, update: {} });
    categories.set(name, category.id);
  }

  let done = 0;
  for (const p of source) {
    const data = {
      name: p.title,
      slug: p.slug,
      description: p.description,
      brand: p.brand || null,
      upc: p.upc || null,
      condition: p.condition || null,
      price: p.price,
      comparePrice: p.compare_at_price,
      stock: p.stock,
      categoryId: categories.get(p.category)!,
      featured: p.featured ?? false,
    };
    // Ocultos (NEVER_PUBLISHED) hasta el paso 3. Retomar solo actualiza productos que conservan esa marca,
    // comprobado dentro del mismo UPDATE: nunca se vieron ni se vendieron, así que reasignar stock es seguro.
    if (bySku.has(p.sku)) {
      const resumed = await db.product.updateMany({ where: { sku: p.sku, deletedAt: NEVER_PUBLISHED }, data });
      if (resumed.count !== 1) throw new Error(`${p.sku}: ya no está en estado "nunca publicado"; abortando sin activar nada.`);
    } else {
      await db.product.create({ data: { ...data, sku: p.sku, deletedAt: NEVER_PUBLISHED } });
    }
    const product = await db.product.findUniqueOrThrow({ where: { sku: p.sku }, select: { id: true } });

    const media: { url: string; storagePath: string; order: number; size: number }[] = [];
    for (const [i, sourceUrl] of p.images.entries()) {
      const buffer = await processImage(await download(sourceUrl));
      const storagePath = `${product.id}/images/${p.sku}_${i + 1}.webp`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: "image/webp", upsert: true });
      if (error) throw new Error(`${p.sku} ${sourceUrl}: ${error.message}`);
      const url = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
      media.push({ url, storagePath, order: i, size: buffer.length });
    }

    await db.$transaction([
      db.productMedia.deleteMany({ where: { productId: product.id } }),
      db.productMedia.createMany({ data: media.map((m) => ({ ...m, productId: product.id, type: "IMAGE" as const })) }),
      db.product.update({ where: { id: product.id }, data: { imageUrls: media.map((m) => m.url) } }),
    ]);
    // Las categorías nuevas no tienen foto: usan la primera imagen de su primer producto.
    await db.category.updateMany({ where: { id: data.categoryId, imageUrl: null }, data: { imageUrl: media[0].url } });
    done++;
    console.log(`  ✓ [${done}/${source.length}] ${p.sku} ${p.title} (${media.length} img)`);
  }

  // ── 3. Activación atómica: todo el inventario real visible, o nada ──
  const activated = await db.$transaction(async (tx) => {
    const activated = await tx.product.updateMany({
      where: { sku: { in: skus }, deletedAt: NEVER_PUBLISHED },
      data: { deletedAt: null },
    });
    // Lanzar aquí revierte la transacción completa: la tienda queda como estaba.
    if (activated.count !== source.length) {
      throw new Error(`Se esperaban ${source.length} productos activados y fueron ${activated.count}; activación revertida.`);
    }
    return activated;
  });
  // Si esta escritura fallara, la base igual protege: los productos ya no tienen la marca NEVER_PUBLISHED.
  writeState({ ...(readState() as ImportState), phase: "published" });
  console.log(`\nListo: ${activated.count} productos del inventario real visibles; el resto del catálogo sin cambios.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
