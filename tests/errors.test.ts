import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { publicError } from "../server/errors.ts";

test("system errors never reveal paths or internals", () => {
  const enoent = Object.assign(
    Error(
      "ENOENT: no such file or directory, open '/Users/someone/AsBuilt/.data/product-x.json'",
    ),
    { code: "ENOENT" },
  );
  assert.deepEqual(publicError(enoent).status, 404);
  assert.ok(!publicError(enoent).error.includes("/Users"));
  const db = Object.assign(Error('relation "asbuilt_x" does not exist'), {
    code: "42P01",
  });
  assert.equal(publicError(db).status, 500);
  assert.ok(!publicError(db).error.includes("asbuilt_x"));
  assert.equal(
    publicError(
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    ).status,
    500,
  );
  assert.equal(publicError("string").status, 500);
});

test("user-facing validation messages, bad JSON and not-found keep useful statuses", () => {
  assert.deepEqual(
    publicError(Error("Citation does not match captured source req.")),
    {
      status: 400,
      error: "Citation does not match captured source req.",
    },
  );
  assert.equal(publicError(Error("Report not found.")).status, 404);
  assert.equal(
    publicError(
      Object.assign(new SyntaxError("Unexpected token"), {
        type: "entity.parse.failed",
      }),
    ).error,
    "The request was not valid JSON.",
  );
  assert.equal(
    publicError(Object.assign(Error("too big"), { type: "entity.too.large" }))
      .status,
    413,
  );
  assert.equal(publicError(z.string().safeParse(1).error).status, 400);
});
