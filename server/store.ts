import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";
import type { Report } from "./schema.ts";
export const dataDir = resolve(process.env.ASBUILT_DATA_DIR || ".data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
export const reports = new Map<string, Report>();
for (const name of readdirSync(dataDir).filter((x) =>
  /^report-[a-f0-9-]+\.json$/.test(x),
)) {
  try {
    const r: Report = JSON.parse(readFileSync(join(dataDir, name), "utf8"));
    if (["running", "queued"].includes(r.status)) {
      r.status = "interrupted";
      r.error = "The server restarted before verification finished. Run again.";
    }
    reports.set(r.id, r);
  } catch {
    /* A corrupt report must not prevent startup. */
  }
}
export function save(report: Report) {
  reports.set(report.id, report);
  const file = join(dataDir, `report-${report.id}.json`);
  writeFileSync(file + ".tmp", JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  renameSync(file + ".tmp", file);
}
export function getReport(id: string) {
  const report = reports.get(id);
  if (!report) throw Error("Report not found.");
  return report;
}

export function deleteReport(rawId: string) {
  const id = z.string().uuid().parse(rawId);
  const report = getReport(id);
  if (["queued", "running"].includes(report.status))
    throw Error("Wait for this review to finish before deleting it.");
  rmSync(join(dataDir, id), { recursive: true, force: true });
  rmSync(join(dataDir, `report-${id}.json`), { force: true });
  reports.delete(id);
}
