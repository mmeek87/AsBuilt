import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:4320", headless: true },
  webServer: {
    command: "pnpm start",
    url: "http://127.0.0.1:4320",
    reuseExistingServer: false,
    env: {
      PORT: "4320",
      ASBUILT_DATA_DIR: ".data/e2e",
      ASBUILT_TOKEN: "asbuilt-test-token-not-a-production-secret-123",
      OPENAI_API_KEY: "",
      GITHUB_APP_ID: "",
      GITHUB_INSTALLATION_ID: "",
      GITHUB_PRIVATE_KEY_PATH: "",
    },
  },
});
