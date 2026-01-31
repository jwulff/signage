// eslint-disable-next-line @typescript-eslint/triple-slash-reference
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
    const { testApi } = await import("./infra/test-api");
    const { web } = await import("./infra/web");
    const { compositorCron, reconcileCron } = await import("./infra/widgets");
    const { agent, agentAlias, outputs: agentOutputs } = await import("./infra/agent");
    const { outputs: kbOutputs } = await import("./infra/knowledge-base");
    const { outputs: pipelineOutputs } = await import("./infra/analysis-pipeline");

    return {
      websocketUrl: api.url,
      testApiUrl: testApi.url,
      webUrl: web.url,
      compositorCron: compositorCron.nodes.rule.name,
      reconcileCron: reconcileCron.nodes.rule.name,
      // Diabetes AI Analyst
      agentId: agentOutputs.agentId,
      agentAliasId: agentOutputs.agentAliasId,
      knowledgeBaseId: kbOutputs.knowledgeBaseId,
      knowledgeBaseBucket: kbOutputs.bucketName,
    };
  },
});
