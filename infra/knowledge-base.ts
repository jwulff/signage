/**
 * Knowledge Base Infrastructure
 *
 * Creates a Bedrock Knowledge Base with S3 data source for diabetes guidelines.
 * The actual documents (ADA guidelines, etc.) are uploaded separately.
 *
 * NOTE: OpenSearch Serverless is not yet supported in the SST/Pulumi AWS provider.
 * The Knowledge Base is disabled until this is resolved. The agent will work
 * without the KB - it just won't have access to ADA guidelines for RAG.
 *
 * TODO: Enable Knowledge Base when OpenSearch Serverless support is available
 * or use an alternative vector store (Pinecone, Aurora PostgreSQL).
 */

// Flag to enable/disable Knowledge Base (disabled until OpenSearch Serverless works)
const ENABLE_KNOWLEDGE_BASE = false;

// =============================================================================
// S3 Bucket for Knowledge Base Documents
// =============================================================================

// S3 bucket to store diabetes guidelines and reference documents
// Created regardless of KB status so documents can be uploaded
export const knowledgeBaseBucket = new sst.aws.Bucket("DiabetesKnowledgeDocs", {
  // Keep documents even if stack is removed (valuable reference data)
  transform: {
    bucket: {
      forceDestroy: false,
    },
  },
});

// =============================================================================
// Knowledge Base (Disabled)
// =============================================================================

// Export placeholder outputs when KB is disabled
export const outputs = {
  knowledgeBaseId: ENABLE_KNOWLEDGE_BASE ? "" : "disabled",
  knowledgeBaseName: ENABLE_KNOWLEDGE_BASE ? "" : "disabled",
  bucketName: knowledgeBaseBucket.name,
  bucketArn: knowledgeBaseBucket.arn,
  collectionEndpoint: ENABLE_KNOWLEDGE_BASE ? "" : "disabled",
  status: ENABLE_KNOWLEDGE_BASE ? "enabled" : "disabled - OpenSearch Serverless not supported",
};

// =============================================================================
// Full Knowledge Base Implementation (for future use)
// =============================================================================

/*
When OpenSearch Serverless becomes available in SST/Pulumi, uncomment this code:

// Note: agent.ts was removed when switching from InvokeAgent to InvokeModel

const currentPartition = aws.getPartition({});
const currentRegion = aws.getRegion({});
const callerIdentity = aws.getCallerIdentity({});

// IAM role for the Bedrock Knowledge Base
export const knowledgeBaseRole = new aws.iam.Role("DiabetesKnowledgeBaseRole", {
  name: $interpolate`diabetes-kb-${$app.stage}`,
  assumeRolePolicy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["sts:AssumeRole"],
        principals: [
          {
            type: "Service",
            identifiers: ["bedrock.amazonaws.com"],
          },
        ],
        conditions: [
          {
            test: "StringEquals",
            variable: "aws:SourceAccount",
            values: [callerIdentity.then((id) => id.accountId)],
          },
          {
            test: "ArnLike",
            variable: "aws:SourceArn",
            values: [
              $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}:${callerIdentity.then((id) => id.accountId)}:knowledge-base/*`,
            ],
          },
        ],
      },
    ],
  }).json,
});

// Policy for Knowledge Base to access S3
new aws.iam.RolePolicy("DiabetesKnowledgeBaseS3Policy", {
  role: knowledgeBaseRole.id,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [
          knowledgeBaseBucket.arn,
          $interpolate`${knowledgeBaseBucket.arn}/*`,
        ],
        effect: "Allow",
      },
    ],
  }).json,
});

// Policy for Knowledge Base to use embeddings model
new aws.iam.RolePolicy("DiabetesKnowledgeBaseModelPolicy", {
  role: knowledgeBaseRole.id,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["bedrock:InvokeModel"],
        resources: [
          $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
        effect: "Allow",
      },
    ],
  }).json,
});

// OpenSearch Serverless resources would go here...

export const knowledgeBase = new aws.bedrock.AgentKnowledgeBase("DiabetesGuidelines", {
  name: $interpolate`diabetes-guidelines-${$app.stage}`,
  description: "ADA diabetes management guidelines",
  roleArn: knowledgeBaseRole.arn,
  knowledgeBaseConfiguration: {
    type: "VECTOR",
    vectorKnowledgeBaseConfiguration: {
      embeddingModelArn: $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}::foundation-model/amazon.titan-embed-text-v2:0`,
    },
  },
  storageConfiguration: {
    type: "OPENSEARCH_SERVERLESS",
    opensearchServerlessConfiguration: {
      collectionArn: opensearchCollection.arn,
      vectorIndexName: "diabetes-guidelines-index",
      fieldMapping: {
        vectorField: "vector",
        textField: "text",
        metadataField: "metadata",
      },
    },
  },
});

export const agentKnowledgeBaseAssociation =
  new aws.bedrock.AgentAgentKnowledgeBaseAssociation(
    "DiabetesAnalystKBAssociation",
    {
      agentId: agent.agentId,
      agentVersion: "DRAFT",
      knowledgeBaseId: knowledgeBase.id,
      description: "Association with diabetes guidelines",
      knowledgeBaseState: "ENABLED",
    }
  );
*/
