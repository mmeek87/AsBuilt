import { Sandbox } from "@vercel/sandbox";
if (process.env.ASBUILT_APPROVE_CLOUD_SETUP !== "true")
  throw Error(
    "This creates a billed Vercel browser environment. Set ASBUILT_APPROVE_CLOUD_SETUP=true only after approving costs and configuring Vercel authentication.",
  );
const sandbox = await Sandbox.create({
  image: "vercel/sandbox/node:24",
  timeout: 600000,
  resources: { vcpus: 2 },
  networkPolicy: "allow-all",
});
try {
  for (const args of [
    ["init", "-y"],
    ["install", "--ignore-scripts", "playwright@1.65.1"],
  ]) {
    const r = await sandbox.runCommand({ cmd: "npm", args });
    if (r.exitCode !== 0) throw Error("Browser package setup failed.");
  }
  const install = await sandbox.runCommand({
    cmd: "npx",
    args: ["playwright", "install", "--with-deps", "chromium"],
    sudo: true,
    env: { PLAYWRIGHT_BROWSERS_PATH: "/vercel/sandbox/browsers" },
  });
  if (install.exitCode !== 0) throw Error("Chromium setup failed.");
  // Installation uses only trusted package code. No target page runs before deny-all.
  await sandbox.update({ networkPolicy: "deny-all" });
  const check = await sandbox.runCommand({
    env: { PLAYWRIGHT_BROWSERS_PATH: "/vercel/sandbox/browsers" },
    cmd: "node",
    args: [
      "--input-type=module",
      "-e",
      "import {chromium} from 'playwright'; const b=await chromium.launch();console.log(b.version());await b.close();",
    ],
  });
  if (check.exitCode !== 0) throw Error("Chromium launch failed.");
  const snapshot = await sandbox.snapshot();
  console.log(`ASBUILT_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
} finally {
  await sandbox.stop();
}
