/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "signage",
      removal: input?.stage === "prod" ? "retain" : "remove",
      protect: ["prod"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    // Import infrastructure stacks
    const { api } = await import("./infra/api");
    const { web } = await import("./infra/web");

    return {
      websocketUrl: api.url,
      webUrl: web.url,
    };
  },
});
