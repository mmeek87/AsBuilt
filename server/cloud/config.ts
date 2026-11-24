export function cloudConfig(env = process.env) {
  const required = [
    "DATABASE_URL",
    "BLOB_READ_WRITE_TOKEN",
    "ASBUILT_TOKEN",
    "ASBUILT_PUBLIC_ORIGIN",
  ] as const;
  if (required.some((k) => !env[k]))
    throw Error(
      "Online setup is incomplete. Configure the database, private screenshot store, access key and public origin.",
    );
  const origin = new URL(env.ASBUILT_PUBLIC_ORIGIN!);
  if (
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw Error("ASBUILT_PUBLIC_ORIGIN must be an exact HTTPS origin.");
  if (env.ASBUILT_TOKEN!.length < 32)
    throw Error("Choose an access key with at least 32 characters.");
  const dailyLimit = Number(env.ASBUILT_DAILY_RUN_LIMIT || "5");
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 20)
    throw Error("Daily run limit must be between 1 and 20.");
  return {
    origin: origin.origin,
    token: env.ASBUILT_TOKEN!,
    dailyLimit,
    enabled: env.ASBUILT_CLOUD_RUNS_ENABLED === "true",
    snapshot: env.ASBUILT_SANDBOX_SNAPSHOT_ID,
    origins: (env.ASBUILT_PREVIEW_ORIGINS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    imagePrefixes: (env.ASBUILT_IMAGE_PREFIXES || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  };
}
