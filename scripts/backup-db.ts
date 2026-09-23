// Respaldo completo: todas las tablas a JSON + archivos del bucket product-media.
// Uso: npx tsx scripts/backup-db.ts [carpeta-destino]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const db = new PrismaClient();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "product-media";

const outDir = process.argv[2] ?? join("backups", new Date().toISOString().slice(0, 10));

async function listAll(prefix: string): Promise<string[]> {
  const files: string[] = [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    // Las carpetas no tienen id en Supabase Storage
    if (item.id === null) files.push(...(await listAll(path)));
    else files.push(path);
  }
  return files;
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const tables = {
    user: await db.user.findMany(),
    category: await db.category.findMany(),
    product: await db.product.findMany(),
    productMedia: await db.productMedia.findMany(),
    cartItem: await db.cartItem.findMany(),
    order: await db.order.findMany(),
    orderItem: await db.orderItem.findMany(),
  };

  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(tables)) {
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(rows, null, 2));
    counts[name] = rows.length;
  }
  console.log("Tablas:", counts);

  const files = await listAll("");
  let ok = 0;
  for (const path of files) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error) {
      console.log(`  ✗ ${path}: ${error.message}`);
      continue;
    }
    const dest = join(outDir, "storage", BUCKET, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
    ok++;
  }
  console.log(`Storage: ${ok}/${files.length} archivos descargados`);

  const complete = ok === files.length;
  writeFileSync(
    join(outDir, "manifest.json"),
    JSON.stringify(
      { createdAt: new Date().toISOString(), complete, counts, storageFiles: ok, storageTotal: files.length },
      null,
      2
    )
  );
  // El respaldo es el control de recuperación: incompleto = fallido.
  if (!complete) {
    throw new Error(`Respaldo INCOMPLETO: faltan ${files.length - ok} archivos de Storage (${outDir})`);
  }
  console.log(`Respaldo completo en ${outDir}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
