import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
if (process.argv.slice(2).join(" ") !== "--approved --approve-actions")
  throw Error(
    "Explicit approval of docs/examples/ebarrel-menu-journey.json is required.",
  );
const home = process.env.ASBUILT_HOME;
if (!home) throw Error("Set ASBUILT_HOME to the local service checkout.");
const client = new Client({
  name: "asbuilt-menu-integration-check",
  version: "1.0",
});
async function call(name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw Error(JSON.stringify(r.content));
  return JSON.parse((r.content as { text: string }[])[0].text);
}
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        resolve(home, "node_modules/tsx/dist/loader.mjs"),
        resolve(home, "server/stdio.ts"),
      ],
      cwd: home,
      env: {
        PATH: process.env.PATH!,
        ASBUILT_TOKEN_FILE: resolve(home, ".data/token"),
      },
      stderr: "inherit",
    }),
  );
  const definition = (await client.listTools()).tools.find(
    (t) => t.name === "start_verification",
  );
  if (!JSON.stringify(definition?.inputSchema).includes('"menu"'))
    throw Error("MCP menu schema missing.");
  const status = await call("get_connection_status");
  console.log(JSON.stringify({ version: status.version, menuSchema: true }));
  const plan = JSON.parse(
    readFileSync("docs/examples/ebarrel-menu-journey.json", "utf8"),
  );
  const run = await call("start_verification", {
    ...plan,
    approved: true,
    actionsApproved: true,
  });
  console.log("MCP run " + run.id);
  for (let i = 0; i < 90; i++) {
    const state = await call("check_verification", { id: run.id });
    if (!["queued", "running"].includes(state.status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const report = await call("get_report", { id: run.id });
  writeFileSync(
    join(tmpdir(), "asbuilt-menu-mcp-report.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      id: report.id,
      status: report.status,
      results: report.results.map((r: any) => ({
        id: r.criterion.id,
        viewport: r.viewport,
        status: r.status,
        observed: r.observed,
      })),
    }),
  );
} finally {
  await client.close();
}
