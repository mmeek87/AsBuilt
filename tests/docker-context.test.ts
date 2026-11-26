import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The isolated browser image only receives files allowed by .dockerignore.
// A file copied by the Dockerfile but not allowed there breaks every
// interactive check at build time (which happened once, in 1.1.0).
test("every file the browser image copies is allowed into its build context", () => {
  const copied = readFileSync("Dockerfile.browser", "utf8")
    .split("\n")
    .filter((l) => l.startsWith("COPY "))
    .flatMap((l) => l.split(/\s+/).slice(1, -1));
  const allowed = new Set(
    readFileSync(".dockerignore", "utf8")
      .split("\n")
      .filter((l) => l.startsWith("!"))
      .map((l) => l.slice(1).trim()),
  );
  assert.ok(copied.length > 5);
  for (const file of copied) assert.ok(allowed.has(file), `${file} is copied but not allowed in .dockerignore`);
});

test("every server module the worker imports is copied into the image", () => {
  const copied = new Set(readFileSync("Dockerfile.browser", "utf8").match(/server\/[\w-]+\.mjs/g));
  for (const file of copied)
    for (const [, dep] of readFileSync(file, "utf8").matchAll(/from "\.\/([\w-]+\.mjs)"/g))
      assert.ok(copied.has(`server/${dep}`), `${file} imports ${dep}, which isn't copied into the image`);
});
