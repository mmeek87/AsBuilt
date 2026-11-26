import { readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { dataDir, getReport } from "./store.ts";
import { startVerification } from "./runner.ts";
import {
  productService,
  type ProductReview,
  type ProductStorage,
} from "./product-review.ts";
const file = (id: string) =>
  join(dataDir, `product-${z.string().uuid().parse(id)}.json`);
const read = (id: string): ProductReview =>
  JSON.parse(readFileSync(file(id), "utf8"));
function save(review: ProductReview) {
  const path = file(review.id);
  writeFileSync(path + ".tmp", JSON.stringify(review, null, 2), {
    mode: 0o600,
  });
  renameSync(path + ".tmp", path);
}
const storage: ProductStorage = {
  async list() {
    return readdirSync(dataDir)
      .filter((n) => /^product-[a-f0-9-]+\.json$/.test(n))
      .flatMap((n) => {
        try {
          return [read(n.slice(8, -5))];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async get(id) {
    return read(id);
  },
  async create(review) {
    if ((await this.list()).length >= 100)
      throw Error("Product review limit reached.");
    save(review);
  },
  async appendRun(id, run) {
    const review = read(id);
    review.runs.push(run);
    save(review);
  },
};
export const localProducts = productService(
  storage,
  async (id) => getReport(id),
  async (plan) => startVerification(plan),
);
