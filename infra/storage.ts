// DynamoDB table for connection, widget state, and diabetes data
export const table = new sst.aws.Dynamo("SignageTable", {
  fields: {
    pk: "string",
    sk: "string",
    gsi1pk: "string",
    gsi1sk: "string",
    gsi2pk: "string",
    gsi2sk: "string",
  },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  globalIndexes: {
    // GSI1: Cross-type time-ordered queries
    // PK: USR#userId#ALL, SK: timestamp
    // Use case: "Get all records for user in last 24 hours"
    gsi1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },

    // GSI2: Type-based date range queries
    // PK: USR#userId#TYPE, SK: date#timestamp
    // Use case: "Get CGM readings for last 7 days"
    gsi2: { hashKey: "gsi2pk", rangeKey: "gsi2sk" },
  },
  ttl: "ttl",
});
