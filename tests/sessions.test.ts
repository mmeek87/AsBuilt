import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sessionStore, rememberedSeconds } from "../server/sessions.ts";
test("remembered sessions survive restart, expire, revoke and reject key rotation", () => {
  const dir = mkdtempSync(join(tmpdir(), "asbuilt-session-"));
  try {
    let now = Date.now();
    const path = join(dir, "sessions.json");
    const first = sessionStore(path, "first-key", () => now);
    const remembered = first.issue(true).value;
    const temporary = first.issue(false).value;
    assert.equal(first.valid(temporary), true);
    assert.equal(readFileSync(path, "utf8").includes(remembered), false);
    const restarted = sessionStore(path, "first-key", () => now);
    assert.equal(restarted.valid(remembered), true);
    assert.equal(restarted.valid(temporary), false);
    assert.equal(
      sessionStore(path, "different-key", () => now).valid(remembered),
      false,
    );
    const second = restarted.issue(true).value;
    restarted.revoke(remembered);
    assert.equal(
      sessionStore(path, "first-key", () => now).valid(remembered),
      false,
    );
    assert.equal(restarted.valid(second), true);
    now += rememberedSeconds * 1000;
    assert.equal(restarted.valid(second), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
