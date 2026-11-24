import { migrate } from "../server/cloud/database.ts";
if (!process.env.DATABASE_URL)
  throw Error("Set DATABASE_URL for the dedicated AsBuilt database.");
await migrate();
console.log("AsBuilt database tables are ready.");
