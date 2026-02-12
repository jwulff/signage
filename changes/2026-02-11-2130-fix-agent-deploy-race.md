# Fix agent deploy race condition

*Date: 2026-02-11 2130*

## Why

PR #231 (Haiku model switch) failed during deploy because Pulumi updated
the agent's foundation model before the IAM policy allowing the new model
was applied. Bedrock validates the agent role's permissions during
UpdateAgent — the deploy failed with AccessDeniedException.

This left production in a broken state: the agent role only allowed Haiku,
but the alias still routed to version 3 (Sonnet), causing every stream
consumer invocation to fail with "Access denied when calling Bedrock."

## How

Two changes to `infra/agent.ts`:

1. Added `dependsOn: [agentModelPolicy]` to the agent resource so the IAM
   policy is always applied before the agent model is changed.

2. Expanded the model policy to allow both Haiku and Sonnet model families.
   The alias may route to older versions that use a different model than the
   current DRAFT — both need to be permitted.

## Key Design Decisions

- Including both model families prevents breakage when the alias routes to
  an older version. This is a safety net until alias version management is
  automated (existing TODO).
- The `dependsOn` is the minimal fix for the race condition. Pulumi already
  infers a dependency on the role itself, but not on the role's policies.

## What's Next

- Automate alias version management (see existing TODO in infra/agent.ts)
- Once the alias reliably routes to the latest version, remove Sonnet from
  the model policy
