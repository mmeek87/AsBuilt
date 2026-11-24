import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { makeMcp } from "./mcp.ts";
import { bridgeEndpoint, bridgeToken } from "./bridge-config.ts";
const endpoint = bridgeEndpoint(process.env.ASBUILT_URL);
await makeMcp(async (name, args) => {
  let r: Response;
  try {
    r = await fetch(`${endpoint}/api/tools/${name}`, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${bridgeToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(360000),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Start AsBuilt"))
      throw error;
    throw Error(
      "Cannot reach the local AsBuilt service. Start it with pnpm start, then try again. Redirects are not allowed.",
    );
  }
  if (r.status === 401)
    throw Error(
      "AsBuilt rejected the connection key. Check ASBUILT_TOKEN_FILE or ASBUILT_TOKEN matches the running service.",
    );
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "AsBuilt request failed.");
  return data;
}).connect(new StdioServerTransport());
