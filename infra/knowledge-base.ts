/**
 * Knowledge Base Infrastructure
 *
 * Creates a Bedrock Knowledge Base with S3 data source for diabetes guidelines.
 * The actual documents (ADA guidelines, etc.) are uploaded separately.
 */

import { agent } from "./agent";

// =============================================================================
// S3 Bucket for Knowledge Base Documents
// =============================================================================

// S3 bucket to store diabetes guidelines and reference documents
export const knowledgeBaseBucket = new sst.aws.Bucket("DiabetesKnowledgeDocs", {
  // Keep documents even if stack is removed (valuable reference data)
  transform: {
    bucket: {
      forceDestroy: false,
    },
  },
});

// =============================================================================
// IAM Role for Knowledge Base
// =============================================================================

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

// =============================================================================
// OpenSearch Serverless Collection
// =============================================================================

// Security policy for OpenSearch collection
const opensearchEncryptionPolicy = new aws.opensearchserverless.SecurityPolicy(
  "DiabetesKBEncryption",
  {
    name: $interpolate`diabetes-kb-enc-${$app.stage}`,
    type: "encryption",
    policy: $interpolate`{
      "Rules": [
        {
          "ResourceType": "collection",
          "Resource": ["collection/diabetes-kb-${$app.stage}"]
        }
      ],
      "AWSOwnedKey": true
    }`,
  }
);

const opensearchNetworkPolicy = new aws.opensearchserverless.SecurityPolicy(
  "DiabetesKBNetwork",
  {
    name: $interpolate`diabetes-kb-net-${$app.stage}`,
    type: "network",
    policy: $interpolate`[
      {
        "Rules": [
          {
            "ResourceType": "collection",
            "Resource": ["collection/diabetes-kb-${$app.stage}"]
          },
          {
            "ResourceType": "dashboard",
            "Resource": ["collection/diabetes-kb-${$app.stage}"]
          }
        ],
        "AllowFromPublic": true
      }
    ]`,
  }
);

const opensearchDataPolicy = new aws.opensearchserverless.AccessPolicy(
  "DiabetesKBAccess",
  {
    name: $interpolate`diabetes-kb-access-${$app.stage}`,
    type: "data",
    policy: $interpolate`[
      {
        "Rules": [
          {
            "ResourceType": "collection",
            "Resource": ["collection/diabetes-kb-${$app.stage}"],
            "Permission": ["aoss:CreateCollectionItems", "aoss:UpdateCollectionItems", "aoss:DescribeCollectionItems"]
          },
          {
            "ResourceType": "index",
            "Resource": ["index/diabetes-kb-${$app.stage}/*"],
            "Permission": ["aoss:CreateIndex", "aoss:UpdateIndex", "aoss:DescribeIndex", "aoss:ReadDocument", "aoss:WriteDocument"]
          }
        ],
        "Principal": ["${knowledgeBaseRole.arn}"]
      }
    ]`,
  }
);

// OpenSearch Serverless collection for vector storage
const opensearchCollection = new aws.opensearchserverless.Collection(
  "DiabetesKBCollection",
  {
    name: $interpolate`diabetes-kb-${$app.stage}`,
    type: "VECTORSEARCH",
    description: "Vector store for diabetes guidelines knowledge base",
  },
  {
    dependsOn: [
      opensearchEncryptionPolicy,
      opensearchNetworkPolicy,
      opensearchDataPolicy,
    ],
  }
);

// =============================================================================
// Bedrock Knowledge Base
// =============================================================================

export const knowledgeBase = new aws.bedrock.AgentKnowledgeBase("DiabetesGuidelines", {
  name: $interpolate`diabetes-guidelines-${$app.stage}`,
  description: "ADA diabetes management guidelines, insulin adjustment protocols, and best practices for Type 1 diabetes management",
  roleArn: knowledgeBaseRole.arn,

  // Use Titan embeddings for semantic search
  knowledgeBaseConfiguration: {
    type: "VECTOR",
    vectorKnowledgeBaseConfiguration: {
      embeddingModelArn: $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}::foundation-model/amazon.titan-embed-text-v2:0`,
    },
  },

  // Use OpenSearch Serverless as the vector store
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

// =============================================================================
// S3 Data Source
// =============================================================================

export const knowledgeBaseDataSource = new aws.bedrock.AgentDataSource(
  "DiabetesGuidelinesSource",
  {
    knowledgeBaseId: knowledgeBase.id,
    name: "diabetes-guidelines-s3",
    description: "S3 bucket containing diabetes management documents",
    dataSourceConfiguration: {
      type: "S3",
      s3Configuration: {
        bucketArn: knowledgeBaseBucket.arn,
        // Include all documents in the bucket root
        // Subfolders can be used to organize by category:
        // /ada-standards/ - ADA Standards of Medical Care
        // /insulin-protocols/ - Insulin adjustment guidelines
        // /pump-settings/ - Pump configuration best practices
      },
    },
    // Chunking strategy for document processing
    vectorIngestionConfiguration: {
      chunkingConfiguration: {
        chunkingStrategy: "FIXED_SIZE",
        fixedSizeChunkingConfiguration: {
          maxTokens: 300,
          overlapPercentage: 20,
        },
      },
    },
  }
);

// =============================================================================
// Associate Knowledge Base with Agent
// =============================================================================

export const agentKnowledgeBaseAssociation =
  new aws.bedrock.AgentAgentKnowledgeBaseAssociation(
    "DiabetesAnalystKBAssociation",
    {
      agentId: agent.agentId,
      agentVersion: "DRAFT",
      knowledgeBaseId: knowledgeBase.id,
      description:
        "Association with diabetes guidelines for evidence-based recommendations",
      knowledgeBaseState: "ENABLED",
    }
  );

// =============================================================================
// Exports
// =============================================================================

export const outputs = {
  knowledgeBaseId: knowledgeBase.id,
  knowledgeBaseName: knowledgeBase.name,
  bucketName: knowledgeBaseBucket.name,
  bucketArn: knowledgeBaseBucket.arn,
  collectionEndpoint: opensearchCollection.collectionEndpoint,
};
