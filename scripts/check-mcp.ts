import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const client = new Client({ name: "asbuilt-connection-check", version: "1.0" });
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        fileURLToPath(
          new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url),
        ),
        fileURLToPath(new URL("../server/stdio.ts", import.meta.url)),
      ],
      stderr: "inherit",
    }),
  );
  const tools = await client.listTools();
  const result = await client.callTool({
    name: "get_connection_status",
    arguments: {},
  });
  if (result.isError) throw Error(JSON.stringify(result.content));
  console.log(
    JSON.stringify(
      {
        connection: "ready",
        tools: tools.tools.map((t) => t.name),
        status: result.structuredContent,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
