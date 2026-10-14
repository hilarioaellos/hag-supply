// Respaldo completo: todas las tablas a JSON + archivos del bucket product-media.
// Uso: npx tsx scripts/backup-db.ts [carpeta-destino]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
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

  // SQL directo (no los modelos de Prisma): así respalda todas las columnas que existan en la base,
  // aunque el cliente generado ya tenga campos de una migración que todavía no se aplicó.
  const tables = ["User", "Category", "Product", "ProductMedia", "CartItem", "Order", "OrderItem"];

  const counts: Record<string, number> = {};
  for (const table of tables) {
    const rows = await db.$queryRawUnsafe<{ r: unknown }[]>(`SELECT row_to_json(t) AS r FROM "${table}" t`);
    const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${table}"`);
    const file = join(outDir, `${table}.json`);
    writeFileSync(file, JSON.stringify(rows.map((row) => row.r), null, 2));
    // Verificación: el archivo se vuelve a leer y debe tener tantas filas como la tabla.
    const written = (JSON.parse(readFileSync(file, "utf8")) as unknown[]).length;
    if (written !== n) throw new Error(`Respaldo INCOMPLETO: ${table} tiene ${n} filas y el archivo ${written}`);
    counts[table] = n;
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
    const buffer = Buffer.from(await data.arrayBuffer());
    if (buffer.length === 0) {
      console.log(`  ✗ ${path}: archivo vacío`);
      continue;
    }
    const dest = join(outDir, "storage", BUCKET, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buffer);
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
