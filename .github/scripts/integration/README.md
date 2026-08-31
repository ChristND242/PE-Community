# Release Publisher Integration Harness

This harness exercises the production release publisher core against a dedicated GitHub test repository. It is not a production release workflow and it refuses `Pona-Ekolo/PE-Community` as a target.

## One-time setup

1. Create the dedicated private repository `Pona-Ekolo/PE-Community-Release-Test`. The harness allowlists this repository only, case-insensitively.
2. Place this public source tree in that repository, or check out the exact production-source commit under test.
3. Choose an existing commit in the isolated repository as the harness source commit.
4. Supply a short-lived token through `GH_TOKEN` with repository Contents read/write access for the isolated repository only. Do not use production deployment, updater-host, or GHCR credentials.
5. Run the harness locally or from a `workflow_dispatch` workflow in the isolated repository.

The recommended isolated workflow uses `workflow_dispatch` only, grants `contents: write` only in the isolated repository, and invokes the command below. Do not add that permission to the production repository's normal release workflow.

## Run

```bash
GH_TOKEN='...' node .github/scripts/integration/release-publisher.integration.mjs \
  --repository Pona-Ekolo/PE-Community-Release-Test \
  --source-commit <isolated-repository-commit-sha> \
  --run-id release-audit-20260901
```

The harness creates annotated tags in the `release-test-<run-id>-*` namespace, uses three deterministic tiny artifacts, and runs clean creation, partial resume, complete-draft, collision, unexpected-asset, and published-release scenarios. It prints tags, release IDs, URLs, asset inventories, and pass/fail results. It does not clean up automatically.

Unknown-outcome transport behavior remains covered by the local publisher transport-injection tests because deliberately breaking real GitHub requests is neither safe nor useful.

## Explicit cleanup

Only after reviewing the printed results, run:

```bash
GH_TOKEN='...' node .github/scripts/integration/release-publisher.integration.mjs \
  --cleanup \
  --repository Pona-Ekolo/PE-Community-Release-Test \
  --source-commit <isolated-repository-commit-sha> \
  --run-id release-audit-20260901 \
  --confirm-run-id release-audit-20260901
```

Cleanup rejects the production repository, requires an exact run-ID confirmation, enumerates only exact matching test tags, and deletes no wildcard or semantic-version production tag.
