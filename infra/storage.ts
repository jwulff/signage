// DynamoDB table for connection and widget state
export const table = new sst.aws.Dynamo("SignageTable", {
  fields: {
    pk: "string",
    sk: "string",
  },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  ttl: "ttl",
  // GSIs will be added as needed for query patterns
});
