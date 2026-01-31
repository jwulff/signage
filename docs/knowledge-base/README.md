# Diabetes Knowledge Base Documents

This directory contains reference documents for the Diabetes AI Analyst knowledge base.

## Document Categories

### ADA Standards (`ada-standards/`)
- Blood glucose targets for adults with diabetes
- Time in range (TIR) recommendations
- A1C correlation tables
- Hypoglycemia definitions and thresholds

### Insulin Protocols (`insulin-protocols/`)
- Basal rate adjustment guidelines (rule of 1800/1500)
- I:C ratio tuning procedures
- ISF (correction factor) adjustment methods
- Pattern-based adjustment rules

### Pump Settings (`pump-settings/`)
- Duration of insulin action (DIA) recommendations
- Active insulin time calculations
- Target range recommendations by time of day
- Exercise and meal timing considerations

## Document Format

Documents should be in one of these formats:
- PDF (preferred for official guidelines)
- Markdown (for custom-written content)
- Plain text

## Uploading Documents

After creating the stack, upload documents to the S3 bucket:

```bash
# Get bucket name from SST outputs
sst shell -- printenv | grep KNOWLEDGE

# Upload documents
aws s3 sync ./docs/knowledge-base/content s3://<bucket-name>/
```

## Triggering Re-indexing

After uploading new documents, trigger a sync:

```bash
# Via AWS Console:
# Bedrock > Knowledge bases > diabetes-guidelines-* > Sync

# Or via CLI:
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id <kb-id> \
  --data-source-id <ds-id>
```

## Citation Tracking

The agent will include citations in responses when referencing these documents.
Format: `[Source: document-name.pdf, page X]`
