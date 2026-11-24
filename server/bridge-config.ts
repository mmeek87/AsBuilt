import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export function bridgeEndpoint(value = "http://127.0.0.1:4310") {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error(
      "The MCP bridge requires a plain local HTTP origin, such as http://127.0.0.1:4310.",
    );
  return url.origin;
}
export function bridgeToken() {
  if (process.env.ASBUILT_TOKEN) return process.env.ASBUILT_TOKEN;
  const path =
    process.env.ASBUILT_TOKEN_FILE ||
    fileURLToPath(new URL("../.data/token", import.meta.url));
  try {
    const token = readFileSync(path, "utf8").trim();
    if (token.length < 32) throw Error();
    return token;
  } catch {
    throw Error(
      "Start AsBuilt first. For a custom key or data folder, configure ASBUILT_TOKEN or ASBUILT_TOKEN_FILE in this MCP connection.",
    );
  }
}
