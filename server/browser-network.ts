import dns from "node:dns/promises";
import net from "node:net";
import { publicAddress } from "./safety.ts";
export async function resolvePublicTunnel(
  authority: string,
  lookup = dns.lookup,
) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}:443$/.test(authority))
    throw Error("Only public HTTPS port 443 is supported.");
  const hostname = authority.slice(0, -4).toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  )
    throw Error("Private network denied.");
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("Private or reserved network denied.");
  // Prefer IPv4: many CI runners (including GitHub's) have no IPv6 route,
  // so an IPv6-first answer (common behind Cloudflare) would always fail.
  const ordered = [
    ...addresses.filter((a) => a.family === 4),
    ...addresses.filter((a) => a.family !== 4),
  ];
  return {
    hostname,
    address: ordered[0].address,
    family: ordered[0].family,
    addresses: ordered.slice(0, 4),
  };
}

/** Connect to the first validated address that answers. */
function connectAny(addresses: { address: string; family: number }[]) {
  return new Promise<net.Socket>((resolve, reject) => {
    const attempt = (i: number) => {
      if (i >= addresses.length) return reject(Error("No address answered."));
      const socket = net.connect({
        host: addresses[i].address,
        port: 443,
        family: addresses[i].family,
      });
      const fail = () => {
        socket.destroy();
        attempt(i + 1);
      };
      socket.setTimeout(10000, fail);
      socket.once("error", fail);
      socket.once("connect", () => {
        socket.off("error", fail);
        socket.setTimeout(0);
        resolve(socket);
      });
    };
    attempt(0);
  });
}
export function createBrowserNetwork(
  send: (m: unknown) => void,
  denied: (origin: string, reason: string) => void,
) {
  const sockets = new Map<number, net.Socket | null>();
  let count = 0,
    bytes = 0,
    closed = false;
  function close(id: number) {
    const socket = sockets.get(id);
    sockets.delete(id);
    socket?.destroy();
    send({ type: "tunnel-close", id });
  }
  return {
    async receive(m: any) {
      if (closed || !Number.isSafeInteger(m.id) || m.id < 1)
        throw Error("Invalid tunnel identifier.");
      if (m.type === "tunnel-open") {
        if (
          sockets.has(m.id) ||
          ++count > 512 ||
          sockets.size >= 128 ||
          typeof m.authority !== "string"
        ) {
          close(m.id);
          return;
        }
        sockets.set(m.id, null);
        try {
          const destination = await resolvePublicTunnel(m.authority);
          if (closed || !sockets.has(m.id)) return;
          const socket = await connectAny(destination.addresses);
          if (closed || !sockets.has(m.id)) {
            socket.destroy();
            return;
          }
          sockets.set(m.id, socket);
          socket.setTimeout(15000);
          send({ type: "tunnel-ready", id: m.id });
          socket.on("data", (data) => {
            bytes += data.length;
            if (bytes > 100_000_000) {
              close(m.id);
              return;
            }
            for (let i = 0; i < data.length; i += 16384)
              send({
                type: "tunnel-data",
                id: m.id,
                data: data.subarray(i, i + 16384).toString("base64"),
              });
          });
          socket.on("timeout", () => {
            denied(
              `https://${destination.hostname}`,
              "network connection timed out",
            );
            close(m.id);
          });
          socket.on("error", () => {
            denied(
              `https://${destination.hostname}`,
              "network connection failed",
            );
            close(m.id);
          });
          socket.on("close", () => {
            if (sockets.has(m.id)) close(m.id);
          });
        } catch {
          denied(
            "https://blocked.invalid",
            "private, reserved, invalid or unresolved network destination",
          );
          close(m.id);
        }
      } else if (m.type === "tunnel-data") {
        if (typeof m.data !== "string" || m.data.length > 90000)
          throw Error("Invalid tunnel frame.");
        const data = Buffer.from(m.data, "base64");
        bytes += data.length;
        const socket = sockets.get(m.id);
        if (!socket || bytes > 100_000_000 || socket.writableLength > 1048576) {
          close(m.id);
          return;
        }
        socket.write(data);
      } else if (m.type === "tunnel-close") close(m.id);
      else throw Error("Invalid tunnel operation.");
    },
    close() {
      closed = true;
      for (const id of sockets.keys()) close(id);
    },
  };
}
