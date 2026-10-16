// HAG-122: programa en Supabase (pg_cron + pg_net) la llamada a /api/cron/email-outbox cada 5 minutos.
// Vercel Hobby solo permite un cron diario; este programador da la frecuencia operativa.
//
// Uso (contra la base de DATABASE_URL/.env, o sea producción):
//   npx tsx scripts/schedule-email-outbox.ts             → dry-run: muestra lo que haría
//   npx tsx scripts/schedule-email-outbox.ts --apply     → crea extensiones, guarda el secreto y programa
//   npx tsx scripts/schedule-email-outbox.ts --status    → muestra el job y las últimas respuestas HTTP
//   npx tsx scripts/schedule-email-outbox.ts --unschedule → quita el job (el secreto queda en el Vault)
//
// El CRON_SECRET se lee de .env.local y se guarda en el Vault de Supabase (cifrado). Nunca se imprime ni queda
// escrito en el texto del job: el job lo lee del Vault en cada ejecución.
//
// Correlación (HAG-122): pg_net es asíncrono y cron.job_run_details solo dice que la petición se ENCOLÓ. El job
// guarda el request id que devuelve net.http_get en hag_ops.email_outbox_cron_requests (esquema propio, fuera
// de Prisma), y --status cruza esos ids con net._http_response (Supabase conserva las respuestas ~6 h).
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";

const JOB = "hag-supply-email-outbox";
const SECRET_NAME = "hag_supply_cron_secret";
const SCHEDULE = "*/5 * * * *";
const URL = "https://supply.hagpartner.com/api/cron/email-outbox";
// Timeout del cliente por ENCIMA del maxDuration de la ruta (60 s): así siempre llega la respuesta del servidor
// (200, o el 504 de Vercel si se pasara) en vez de un corte del cliente que no dice qué pasó.
const CLIENT_TIMEOUT_MS = 75000; // sin "_": se interpola en SQL
const LOG_TABLE = "hag_ops.email_outbox_cron_requests";

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--status")
    ? "status"
    : process.argv.includes("--unschedule")
      ? "unschedule"
      : "dry-run";

const db = new PrismaClient();

const JOB_SQL = `with req as (
    select net.http_get(
      url := '${URL}',
      headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${SECRET_NAME}')),
      timeout_milliseconds := ${CLIENT_TIMEOUT_MS}
    ) as id
  ), purge as (
    delete from ${LOG_TABLE} where created_at < now() - interval '7 days'
  )
  insert into ${LOG_TABLE} (request_id) select id from req;`;

async function status() {
  const jobs = await db.$queryRawUnsafe<{ jobid: bigint; schedule: string; active: boolean }[]>(
    `select jobid, schedule, active from cron.job where jobname = $1`,
    JOB
  );
  console.log("job:", jobs.length ? jobs.map((j) => ({ jobid: Number(j.jobid), schedule: j.schedule, active: j.active })) : "no programado");
  const runs = await db.$queryRawUnsafe<{ status: string; start_time: Date; return_message: string }[]>(
    `select d.status, d.start_time, d.return_message from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where j.jobname = $1 order by d.start_time desc limit 5`,
    JOB
  );
  console.log("últimas ejecuciones:", runs.map((r) => `${r.start_time.toISOString()} ${r.status} ${r.return_message ?? ""}`.trim()));
  const exists = await db.$queryRawUnsafe<{ t: string | null }[]>(`select to_regclass('${LOG_TABLE}')::text as t`);
  if (!exists[0]?.t) return console.log("respuestas HTTP del job: sin registro todavía (no se ha aplicado)");
  // Solo las peticiones de ESTE job (por request id). Sin fila de respuesta: en curso o ya purgada (> ~6 h).
  const http = await db.$queryRawUnsafe<
    { request_id: bigint; requested: Date; status_code: number | null; timed_out: boolean | null; content: string | null; error_msg: string | null }[]
  >(
    `select r.request_id, r.created_at as requested, h.status_code, h.timed_out, left(h.content, 200) as content, h.error_msg
     from ${LOG_TABLE} r left join net._http_response h on h.id = r.request_id
     order by r.created_at desc limit 5`
  );
  console.log(
    "respuestas HTTP del job:",
    http.map((h) =>
      `#${Number(h.request_id)} ${h.requested.toISOString()} ` +
      (h.status_code === null && !h.error_msg ? "sin respuesta (en curso o purgada)" : `${h.status_code ?? "—"}${h.timed_out ? " TIMEOUT" : ""} ${h.error_msg ?? h.content ?? ""}`)
    )
  );
}

async function main() {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) throw new Error("CRON_SECRET ausente o demasiado corto en .env.local");

  if (mode === "status") return status();

  if (mode === "unschedule") {
    await db.$executeRawUnsafe(`select cron.unschedule(jobid) from cron.job where jobname = $1`, JOB);
    console.log(`job ${JOB} quitado`);
    return status();
  }

  console.log(`Modo: ${mode}`);
  console.log(`1. create extension if not exists pg_net / pg_cron; esquema hag_ops + tabla ${LOG_TABLE}`);
  console.log(`2. Vault: secreto "${SECRET_NAME}" = CRON_SECRET de .env.local (${secret.length} caracteres, no se muestra)`);
  console.log(`3. cron.schedule('${JOB}', '${SCHEDULE}', <GET ${URL} con Authorization: Bearer <secreto del Vault>, timeout ${CLIENT_TIMEOUT_MS} ms; guarda el request id>)`);
  if (mode === "dry-run") {
    console.log("Dry-run: no se escribió nada. Usa --apply.");
    return;
  }

  await db.$executeRawUnsafe(`create extension if not exists pg_net`);
  await db.$executeRawUnsafe(`create extension if not exists pg_cron`);
  // Registro de request ids del job (esquema propio, sin acceso desde la API pública de Supabase).
  await db.$executeRawUnsafe(`create schema if not exists hag_ops`);
  await db.$executeRawUnsafe(`revoke all on schema hag_ops from public, anon, authenticated`);
  await db.$executeRawUnsafe(
    `create table if not exists ${LOG_TABLE} (request_id bigint primary key, created_at timestamptz not null default now())`
  );
  // Vault: crear o actualizar el secreto (idempotente). El valor viaja como parámetro, no en el texto SQL.
  const existing = await db.$queryRawUnsafe<{ id: string }[]>(`select id from vault.secrets where name = $1`, SECRET_NAME);
  if (existing.length) {
    await db.$executeRawUnsafe(`select vault.update_secret($1::uuid, $2)`, existing[0].id, secret);
  } else {
    await db.$executeRawUnsafe(`select vault.create_secret($1, $2)`, secret, SECRET_NAME);
  }
  // cron.schedule con el mismo nombre reemplaza el job existente (idempotente).
  await db.$executeRawUnsafe(`select cron.schedule($1, $2, $3)`, JOB, SCHEDULE, JOB_SQL);
  console.log("Programado.");
  await status();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
