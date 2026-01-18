/**
 * SST Resource type declarations for CI builds
 * The actual sst-env.d.ts is auto-generated and gitignored
 */

declare module "sst" {
  export interface Resource {
    DexcomPassword: {
      type: "sst.sst.Secret";
      value: string;
    };
    DexcomUsername: {
      type: "sst.sst.Secret";
      value: string;
    };
    SignageApi: {
      managementEndpoint: string;
      type: "sst.aws.ApiGatewayWebSocket";
      url: string;
    };
    SignageTable: {
      name: string;
      type: "sst.aws.Dynamo";
    };
    SignageTestApi: {
      type: "sst.aws.ApiGatewayV2";
      url: string;
    };
    SignageWeb: {
      type: "sst.aws.StaticSite";
      url: string;
    };
  }
  export const Resource: Resource;
}
