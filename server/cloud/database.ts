import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import type { Report } from "../schema.ts";
import type { ProductReview, ProductStorage } from "../product-review.ts";
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const db = () => neon(process.env.DATABASE_URL!);
export async function migrate() {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS asbuilt_sessions (digest text PRIMARY KEY, key_hash text NOT NULL, expires timestamptz NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS asbuilt_reports (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), report jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS asbuilt_product_reviews (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), review jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS asbuilt_slot (id integer PRIMARY KEY CHECK (id=1), run_id uuid NOT NULL, expires timestamptz NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS asbuilt_budget (day date PRIMARY KEY, count integer NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS asbuilt_login_limit (bucket bigint PRIMARY KEY, count integer NOT NULL)`;
}
export async function loginAttempt() {
  const sql = db();
  const bucket = Math.floor(Date.now() / 600000);
  await sql`DELETE FROM asbuilt_login_limit WHERE bucket < ${bucket - 1}`;
  const rows =
    await sql`INSERT INTO asbuilt_login_limit VALUES (${bucket},1) ON CONFLICT(bucket) DO UPDATE SET count=asbuilt_login_limit.count+1 RETURNING count`;
  return Number(rows[0].count) <= 30;
}
export async function issueSession(key: string, remember: boolean) {
  const value = randomBytes(32).toString("hex");
  const seconds = remember ? 2592000 : 28800;
  const sql = db();
  await sql`DELETE FROM asbuilt_sessions WHERE expires <= now()`;
  await sql`INSERT INTO asbuilt_sessions VALUES (${digest(value)},${digest(key)},now()+${seconds}::integer*interval '1 second')`;
  return { value, seconds };
}
export async function validSession(value: string, key: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) return false;
  return (
    (
      await db()`SELECT digest FROM asbuilt_sessions WHERE digest=${digest(value)} AND key_hash=${digest(key)} AND expires>now()`
    ).length === 1
  );
}
export async function revoke(value: string) {
  await db()`DELETE FROM asbuilt_sessions WHERE digest=${digest(value)}`;
}
export async function recover() {
  await db()`UPDATE asbuilt_reports SET report=jsonb_set(jsonb_set(report,'{status}','"interrupted"'),'{error}','"The online worker stopped before completing. Start a new review."') WHERE report->>'status' IN ('queued','running') AND created_at < now()-interval '6 minutes'`;
}
export async function getReport(id: string): Promise<Report> {
  await recover();
  const rows =
    await db()`SELECT report FROM asbuilt_reports WHERE id=${id}::uuid`;
  if (!rows.length) throw Error("Report not found.");
  return rows[0].report;
}
export async function listReports() {
  await recover();
  const rows =
    await db()`SELECT report FROM asbuilt_reports ORDER BY created_at DESC LIMIT 200`;
  return rows.map((r) => ({
    id: r.report.id,
    status: r.report.status,
    createdAt: r.report.createdAt,
    mode: r.report.mode,
    intent: r.report.plan.intent,
  }));
}
export async function reserve(report: Report, limit: number) {
  const sql = db();
  const slot =
    await sql`INSERT INTO asbuilt_slot VALUES (1,${report.id}::uuid,now()+interval '5 minutes') ON CONFLICT(id) DO UPDATE SET run_id=excluded.run_id,expires=excluded.expires WHERE asbuilt_slot.expires<now() RETURNING run_id`;
  if (!slot.length)
    throw Error("Another verification is running. Please wait.");
  try {
    const counts =
      await sql`SELECT count(*)::int AS count FROM asbuilt_reports`;
    if (counts[0].count >= 200)
      throw Error("The report limit is reached. Delete an old review first.");
    const budget =
      await sql`INSERT INTO asbuilt_budget VALUES (CURRENT_DATE,1) ON CONFLICT(day) DO UPDATE SET count=asbuilt_budget.count+1 WHERE asbuilt_budget.count<${limit} RETURNING count`;
    if (!budget.length)
      throw Error(
        "Today’s browser run limit is reached. Try again tomorrow (UTC).",
      );
    await sql`INSERT INTO asbuilt_reports(id,report) VALUES (${report.id}::uuid,${JSON.stringify(report)}::jsonb)`;
  } catch (e) {
    await release(report.id);
    throw e;
  }
}
export async function save(report: Report) {
  const rows =
    await db()`UPDATE asbuilt_reports SET report=${JSON.stringify(report)}::jsonb WHERE id=${report.id}::uuid AND EXISTS(SELECT 1 FROM asbuilt_slot WHERE run_id=${report.id}::uuid AND expires>now()) RETURNING id`;
  if (!rows.length) throw Error("Run lease expired.");
}
export async function release(id: string) {
  await db()`DELETE FROM asbuilt_slot WHERE run_id=${id}::uuid`;
}
export async function remove(id: string) {
  await db()`DELETE FROM asbuilt_reports WHERE id=${id}::uuid`;
}
export const productStorage: ProductStorage = {
  async list() {
    const rows =
      await db()`SELECT review FROM asbuilt_product_reviews ORDER BY created_at DESC LIMIT 100`;
    return rows.map((r) => r.review as ProductReview);
  },
  async get(id) {
    const rows =
      await db()`SELECT review FROM asbuilt_product_reviews WHERE id=${id}::uuid`;
    if (!rows.length) throw Error("Product review not found.");
    return rows[0].review as ProductReview;
  },
  async create(review) {
    const [{ count }] =
      await db()`SELECT count(*)::int AS count FROM asbuilt_product_reviews`;
    if (count >= 100) throw Error("Product review limit reached.");
    await db()`INSERT INTO asbuilt_product_reviews(id,review) VALUES (${review.id}::uuid,${JSON.stringify(review)}::jsonb)`;
  },
  async appendRun(id, run) {
    await db()`UPDATE asbuilt_product_reviews SET review=jsonb_set(review,'{runs}',(review->'runs') || ${JSON.stringify([run])}::jsonb) WHERE id=${id}::uuid`;
  },
};
