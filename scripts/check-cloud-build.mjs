import assert from "node:assert/strict";
// Exercise the deployed JavaScript entry point, without tsx or native TS loading.
for (const key of ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN", "ASBUILT_TOKEN", "ASBUILT_PUBLIC_ORIGIN"]) delete process.env[key];
const { default: app } = await import("../api/index.js");
const server = app.listen(0, "127.0.0.1");
try {
  await new Promise(resolve => server.once("listening", resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/config`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Online setup is incomplete/);
  console.log("Compiled cloud entry point starts and fails closed without configuration.");
} finally { server.close(); }
