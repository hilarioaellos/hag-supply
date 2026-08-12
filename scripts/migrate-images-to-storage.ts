import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { extname } from "path";
import { randomUUID } from "crypto";

const db = new PrismaClient();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = "product-media";

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer;
  } catch (e: any) {
    return null;
  }
}

function getExtension(url: string): string {
  const ext = extname(new URL(url).pathname).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return ext;
  return ".jpg";
}

async function main() {
  let processed = 0;
  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  const failedUrls: { productId: string; url: string; error: string }[] = [];

  const products = await db.product.findMany({
    where: { imageUrls: { isEmpty: false } },
    select: { id: true, name: true, imageUrls: true, media: { select: { id: true, type: true } } },
  });

  console.log(`\nProductos con imageUrls: ${products.length}\n`);

  for (const product of products) {
    processed++;

    const existingImages = product.media.filter((m) => m.type === "IMAGE");
    if (existingImages.length > 0) {
      console.log(`  [SALTADO] ${product.name} (ya tiene ${existingImages.length} imagen/es en ProductMedia)`);
      skipped++;
      continue;
    }

    console.log(`  [PROCESANDO] ${product.name} (${product.imageUrls.length} imagen/es)`);

    for (let i = 0; i < product.imageUrls.length; i++) {
      const url = product.imageUrls[i];
      const ext = getExtension(url);
      const storagePath = `${product.id}/images/${randomUUID()}${ext}`;

      const buffer = await downloadImage(url);
      if (!buffer) {
        console.log(`    ✗ [${i + 1}] Fallo al descargar: ${url}`);
        failed++;
        failedUrls.push({ productId: product.id, url, error: "descarga fallida" });
        continue;
      }

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(storagePath, buffer, {
          contentType: `image/${ext.replace(".", "").replace("jpg", "jpeg")}`,
          upsert: false,
        });

      if (uploadError) {
        console.log(`    ✗ [${i + 1}] Fallo al subir: ${uploadError.message}`);
        failed++;
        failedUrls.push({ productId: product.id, url, error: uploadError.message });
        continue;
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);

      await db.productMedia.create({
        data: {
          productId: product.id,
          type: "IMAGE",
          url: publicUrlData.publicUrl,
          storagePath,
          order: i,
          size: buffer.length,
        },
      });

      console.log(`    ✓ [${i + 1}] Subida OK -> ${storagePath}`);
      migrated++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("RESUMEN FINAL");
  console.log("=".repeat(50));
  console.log(`Productos procesados : ${processed}`);
  console.log(`Imagenes migradas    : ${migrated}`);
  console.log(`Fallidas             : ${failed}`);
  console.log(`Saltadas (ya tenian) : ${skipped}`);

  if (failedUrls.length > 0) {
    console.log("\nURLs fallidas para revision manual:");
    failedUrls.forEach((f) =>
      console.log(`  - [${f.productId}] ${f.url} -> ${f.error}`)
    );
  }

  console.log("=".repeat(50));
}

main()
  .catch((e) => {
    console.error("Error fatal:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
