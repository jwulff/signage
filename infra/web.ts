import { api } from "./api";

// Static site for web emulator (React + Vite)
// Domain is configured via SIGNAGE_DOMAIN environment variable
const baseDomain = process.env.SIGNAGE_DOMAIN;

export const web = new sst.aws.StaticSite("SignageWeb", {
  path: "packages/web",
  build: {
    command: "pnpm build",
    output: "dist",
  },
  ...(baseDomain && {
    domain:
      $app.stage === "prod"
        ? `signage.${baseDomain}`
        : `${$app.stage}.signage.${baseDomain}`,
  }),
  environment: {
    VITE_WEBSOCKET_URL: api.url,
  },
});
