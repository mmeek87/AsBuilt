import { test } from "node:test";
import assert from "node:assert/strict";
import { bridgeEndpoint } from "../server/bridge-config.ts";
test("MCP bridge only sends credentials to an exact loopback HTTP origin", () => {
  assert.equal(bridgeEndpoint(), "http://127.0.0.1:4310");
  assert.equal(
    bridgeEndpoint("http://localhost:4320/"),
    "http://localhost:4320",
  );
  for (const url of [
    "https://example.com",
    "http://localhost.evil.test",
    "http://user:secret@localhost:4310",
    "file:///tmp/token",
    "http://127.0.0.1:4310/redirect",
    "http://localhost:4310/?key=x",
    "http://localhost:4310/#x",
  ])
    assert.throws(() => bridgeEndpoint(url));
});
