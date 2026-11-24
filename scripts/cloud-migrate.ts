import { migrate } from "../server/cloud/database.ts";
const productionOnly = process.argv.includes("--if-production");
if (productionOnly && (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production")) {
  console.log("Skipping database setup outside Vercel production.");
} else {
  if (!process.env.DATABASE_URL)
    throw Error("Set DATABASE_URL for the dedicated AsBuilt database.");
  await migrate();
  console.log("AsBuilt database tables are ready.");
}
