import http from "node:http";
// Runs only inside the isolated browser container. TLS stays end-to-end in the browser.
export async function createTunnelProxy(send) {
  let next = 0;
  const sockets = new Map();
  const server = http.createServer((_req, res) => {
    res.writeHead(403);
    res.end();
  });
  server.on("connect", (req, socket, head) => {
    const id = ++next;
    if (sockets.size >= 128 || !req.url || req.url.length > 300) {
      socket.destroy();
      return;
    }
    socket.pause();
    sockets.set(id, { socket, head, ready: false });
    socket.on("error", () => socket.destroy());
    socket.on("close", () => {
      sockets.delete(id);
      send({ type: "tunnel-close", id });
    });
    socket.on("data", (data) => {
      for (let i = 0; i < data.length; i += 16384)
        send({
          type: "tunnel-data",
          id,
          data: data.subarray(i, i + 16384).toString("base64"),
        });
    });
    send({ type: "tunnel-open", id, authority: req.url });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    receive(message) {
      const entry = sockets.get(message.id);
      if (!entry) return;
      if (message.type === "tunnel-ready") {
        if (entry.ready) return;
        entry.ready = true;
        entry.socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (entry.head.length)
          send({
            type: "tunnel-data",
            id: message.id,
            data: entry.head.toString("base64"),
          });
        entry.socket.resume();
      } else if (message.type === "tunnel-data") {
        if (
          typeof message.data !== "string" ||
          message.data.length > 90000 ||
          entry.socket.writableLength > 1048576
        ) {
          entry.socket.destroy();
          return;
        }
        entry.socket.write(Buffer.from(message.data, "base64"));
      } else if (message.type === "tunnel-close") entry.socket.destroy();
    },
    close() {
      for (const { socket } of sockets.values()) socket.destroy();
      server.close();
    },
  };
}
