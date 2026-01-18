import { api } from "./api";

// Static site for web emulator (React + Vite)
export const web = new sst.aws.StaticSite("SignageWeb", {
  path: "packages/web",
  build: {
    command: "pnpm build",
    output: "dist",
  },
  domain:
    $app.stage === "prod"
      ? "signage.example.com"
      : `${$app.stage}.signage.example.com`,
  environment: {
    VITE_WEBSOCKET_URL: api.url,
  },
});
