import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePublicTunnel,
  createBrowserNetwork,
} from "../server/browser-network.ts";
import { planSchema, validateExecution } from "../server/schema.ts";
const lookup = (addresses: string[]) => async () =>
  addresses.map((address) => ({
    address,
    family: address.includes(":") ? 6 : 4,
  }));
test("egress validates every DNS answer and pins a public address", async () => {
  assert.equal(
    (
      await resolvePublicTunnel(
        "example.com:443",
        lookup(["93.184.216.34"]) as any,
      )
    ).address,
    "93.184.216.34",
  );
  for (const privateIP of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    await assert.rejects(
      resolvePublicTunnel(
        "example.com:443",
        lookup(["93.184.216.34", privateIP]) as any,
      ),
    );
  for (const authority of [
    "localhost:443",
    "host.local:443",
    "example.com:80",
    "example.com:22",
    "user@example.com:443",
    "example.com:443/path",
    "[::1]:443",
    "example.com:443\r\n",
  ])
    await assert.rejects(
      resolvePublicTunnel(authority, lookup(["93.184.216.34"]) as any),
    );
});
test("normal networking requires explicit acknowledgement and production rejects actions", () => {
  const p = {
    target: "https://example.com",
    intent: "Inspect a public page",
    criteria: [
      { id: "title", expected: "Title", kind: "text", value: "Example" },
    ],
    execution: "interactive",
    approved: true,
    actionsApproved: true,
    network: "browser",
    environment: "test",
    networkApproved: true,
  };
  validateExecution(planSchema.parse(p));
  for (const override of [
    { networkApproved: undefined },
    { environment: undefined },
    { environment: "production" },
    { environment: "production", network: "restricted" },
    { execution: "static" },
  ])
    assert.throws(() =>
      validateExecution(planSchema.parse({ ...p, ...override })),
    );
  validateExecution(
    planSchema.parse({ ...p, environment: "production", publicReadOnly: true }),
  );
  assert.throws(() =>
    validateExecution(
      planSchema.parse({
        ...p,
        environment: "production",
        publicReadOnly: true,
        criteria: [
          {
            ...p.criteria[0],
            actions: [{ type: "click", name: "Save", value: "" }],
          },
        ],
      }),
    ),
  );
});
test("untrusted tunnel frames cannot open arbitrary ports or oversized frames", async () => {
  const output: any[] = [];
  const denied: any[] = [];
  const network = createBrowserNetwork(
    (m) => output.push(m),
    (o, r) => denied.push([o, r]),
  );
  await network.receive({
    type: "tunnel-open",
    id: 1,
    authority: "localhost:22",
  });
  assert.equal(denied.length, 1);
  assert.equal(output[0].type, "tunnel-close");
  await assert.rejects(
    network.receive({ type: "tunnel-data", id: 2, data: "x".repeat(90001) }),
  );
  network.close();
});
