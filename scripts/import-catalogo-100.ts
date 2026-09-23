// Carga del Catálogo 100 (Base_Productos_Vendibles_HAG.xlsx → data/catalogo-100/*.json).
//
// Uso:
//   npm run catalog:import               → dry-run: solo muestra qué haría
//   npm run catalog:import -- --apply    → carga real
//   npm run catalog:import -- --rollback → restaura la tienda al estado previo a la carga
//
// Flujo seguro de --apply:
//   1. Antes de la primera escritura guarda en STATE_FILE qué productos estaban visibles.
//   2. Crea/actualiza los productos del catálogo OCULTOS (deletedAt definido) y sube sus imágenes.
//   3. Solo si los 100 terminan bien: en una única transacción activa el catálogo y oculta los anteriores.
// Si falla en el paso 2, la tienda sigue igual que antes y --rollback funciona igual.
//
// Idempotente: los productos se identifican por sku = ASIN, así que se puede volver a correr.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const db = new PrismaClient();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const BUCKET = "product-media";
const DATA_DIR = join("data", "catalogo-100");
const IMAGES_DIR = "Imagenes-ASIN-Sep2026";
const STATE_FILE = join(DATA_DIR, "pre-import-state.json");
const STOCK = 5;
const MAX_SIDE = 1000;

type SourceRow = {
  category: string;
  supplier: string;
  asin: string;
  brand: string | null;
  sourceName: string;
  upc: string;
  price: number;
  images: string[];
};
type Content = Record<string, { name: string; description: string; flag?: string }>;
type PreImportState = { createdAt: string; visibleIds: string[]; catalogAsins: string[] };

const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--rollback") ? "rollback" : "dry-run";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

// Cuadrada con fondo blanco para que las tarjetas (object-cover) no recorten el producto.
async function processImage(file: string): Promise<Buffer> {
  const img = sharp(file).rotate().flatten({ background: "#ffffff" });
  const { width = MAX_SIDE, height = MAX_SIDE } = await img.metadata();
  const side = Math.min(MAX_SIDE, Math.round(Math.max(width, height) * 1.1));
  const inner = Math.round(side / 1.1);
  const resized = await img.resize(inner, inner, { fit: "inside", withoutEnlargement: true }).toBuffer();
  return sharp({ create: { width: side, height: side, channels: 3, background: "#ffffff" } })
    .composite([{ input: resized, gravity: "center" }])
    .webp({ quality: 82 })
    .toBuffer();
}

function loadSource(): SourceRow[] {
  return JSON.parse(readFileSync(join(DATA_DIR, "source.json"), "utf8"));
}

// Deja visibles exactamente los productos que lo estaban antes de la primera carga.
async function rollback() {
  if (!existsSync(STATE_FILE)) throw new Error(`No existe ${STATE_FILE}; nunca se ejecutó --apply.`);
  const state: PreImportState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const now = new Date();
  const [restored, hidden] = await db.$transaction([
    db.product.updateMany({ where: { id: { in: state.visibleIds } }, data: { deletedAt: null } }),
    db.product.updateMany({
      where: { sku: { in: state.catalogAsins }, id: { notIn: state.visibleIds } },
      data: { deletedAt: now },
    }),
  ]);
  console.log(`Rollback: ${restored.count} productos previos visibles, ${hidden.count} del catálogo ocultos.`);
}

async function main() {
  if (mode === "rollback") return rollback();

  const source = loadSource();
  const content: Content = JSON.parse(readFileSync(join(DATA_DIR, "content.json"), "utf8"));
  const asins = source.map((r) => r.asin);

  // ── Validaciones ──────────────────────────────────────────────
  const errors: string[] = [];
  const categories = new Map((await db.category.findMany()).map((c) => [c.name, c.id]));
  const existing = await db.product.findMany({ select: { id: true, sku: true, slug: true, deletedAt: true } });
  const slugOwner = new Map(existing.map((p) => [p.slug, p.sku]));
  const bySku = new Map(existing.map((p) => [p.sku, p]));

  const plan = source.map((r) => {
    const c = content[r.asin];
    if (!c) errors.push(`${r.asin}: falta en content.json`);
    if (!categories.has(r.category)) errors.push(`${r.asin}: categoría inexistente "${r.category}"`);
    if (!(r.price > 0)) errors.push(`${r.asin}: precio inválido`);
    if (r.images.length === 0) errors.push(`${r.asin}: sin imágenes`);
    for (const f of r.images) if (!existsSync(join(IMAGES_DIR, r.asin, f))) errors.push(`${r.asin}: falta ${f}`);

    let slug = slugify(c?.name ?? r.asin);
    const owner = slugOwner.get(slug);
    if (owner !== undefined && owner !== r.asin) slug = `${slug}-${r.asin.toLowerCase()}`;
    return { ...r, name: c?.name ?? "", description: c?.description ?? "", slug };
  });
  const dupSlugs = plan.map((p) => p.slug).filter((s, i, a) => a.indexOf(s) !== i);
  if (dupSlugs.length) errors.push(`slugs duplicados: ${dupSlugs.join(", ")}`);

  const toHide = existing.filter((p) => p.deletedAt === null && !asins.includes(p.sku ?? ""));
  const toCreate = plan.filter((p) => !bySku.has(p.asin));

  console.log(`Modo: ${mode}`);
  console.log(`Productos a crear: ${toCreate.length} · a actualizar: ${plan.length - toCreate.length}`);
  console.log(`Imágenes a subir: ${plan.reduce((n, p) => n + p.images.length, 0)}`);
  console.log(`Productos actuales a ocultar al final: ${toHide.length}`);
  if (errors.length) {
    console.log(`\n✗ ${errors.length} errores:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log("✓ Validación OK");
  if (mode === "dry-run") {
    for (const p of plan.slice(0, 5)) console.log(`  ${p.asin} → /product/${p.slug} · $${p.price} · ${p.images.length} img`);
    console.log("  …\nDry-run: no se escribió nada. Usa --apply para cargar.");
    return;
  }

  // ── 1. Estado previo (solo en la primera ejecución: los reintentos no lo sobrescriben) ──
  if (!existsSync(STATE_FILE)) {
    const state: PreImportState = {
      createdAt: new Date().toISOString(),
      visibleIds: existing.filter((p) => p.deletedAt === null).map((p) => p.id),
      catalogAsins: asins,
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`Estado previo guardado en ${STATE_FILE} (${state.visibleIds.length} visibles).`);
  } else {
    console.log(`Estado previo ya existente en ${STATE_FILE}; se conserva.`);
  }

  // ── 2. Carga en oculto ────────────────────────────────────────
  let done = 0;
  for (const p of plan) {
    const data = {
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: p.price,
      stock: STOCK,
      categoryId: categories.get(p.category)!,
    };
    // Nuevos → ocultos hasta el paso 3. Existentes → conservan su visibilidad actual.
    const product = await db.product.upsert({
      where: { sku: p.asin },
      create: { ...data, sku: p.asin, deletedAt: new Date() },
      update: data,
    });

    const media: { url: string; storagePath: string; order: number; size: number }[] = [];
    for (const [i, file] of p.images.entries()) {
      const buffer = await processImage(join(IMAGES_DIR, p.asin, file));
      const storagePath = `${product.id}/images/${p.asin}_${i + 1}.webp`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: "image/webp", upsert: true });
      if (error) throw new Error(`${p.asin} ${file}: ${error.message}`);
      const url = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
      media.push({ url, storagePath, order: i, size: buffer.length });
    }

    await db.$transaction([
      db.productMedia.deleteMany({ where: { productId: product.id } }),
      db.productMedia.createMany({ data: media.map((m) => ({ ...m, productId: product.id, type: "IMAGE" as const })) }),
      db.product.update({ where: { id: product.id }, data: { imageUrls: media.map((m) => m.url) } }),
    ]);
    done++;
    console.log(`  ✓ [${done}/${plan.length}] ${p.asin} ${p.name} (${media.length} img)`);
  }

  // ── 3. Activación atómica: catálogo visible + anteriores ocultos, o nada ──
  const now = new Date();
  const { activated, hidden } = await db.$transaction(async (tx) => {
    const activated = await tx.product.updateMany({ where: { sku: { in: asins } }, data: { deletedAt: null } });
    // Lanzar aquí revierte la transacción completa: la tienda queda como estaba.
    if (activated.count !== plan.length) {
      throw new Error(`Se esperaban ${plan.length} productos activados y fueron ${activated.count}; activación revertida.`);
    }
    const hidden = await tx.product.updateMany({
      where: { id: { in: toHide.map((p) => p.id) } },
      data: { deletedAt: now },
    });
    return { activated, hidden };
  });
  console.log(`\nListo: ${activated.count} productos visibles, ${hidden.count} anteriores ocultos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
