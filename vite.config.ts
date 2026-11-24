import { defineConfig } from "vite";
export default defineConfig({
  build: { outDir: "dist" },
  server: {
    host: "127.0.0.1",
    port: 4311,
    proxy: {
      "/api": "http://127.0.0.1:4310",
      "/evidence": "http://127.0.0.1:4310",
    },
  },
});
