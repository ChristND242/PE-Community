# Contributing

Thank you for helping improve PE Community.

## Before You Start

- Use Node.js 22 and pnpm 11.5.2 through Corepack.
- Search existing issues before opening a new one.
- Do not include credentials, personal data, recovery codes, private keys, or security vulnerabilities in public issues or pull requests.
- Report security issues through the private process in [SECURITY.md](SECURITY.md).

## Local Setup

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Replace required secret placeholders in `.env`. The development Compose file starts PostgreSQL and Redis; `pnpm dev` starts the API, application, worker, and shared watcher. Run the documentation site separately with `pnpm site:dev`.

## Changes

- Keep changes focused and preserve existing module boundaries.
- Add or update tests for changed behavior.
- Keep English and French copy aligned when user-facing text changes.
- Add Prisma migrations for schema changes; never edit an already published migration.
- Never log passwords, tokens, message plaintext, private keys, or encrypted-chat recovery material.
- Do not weaken participant, permission, upload, or server-side authorization checks.

## Validation

Run the checks relevant to your change, then run the full release checks before requesting review:

```bash
pnpm exec prisma validate --schema prisma/schema.prisma
pnpm db:generate
pnpm --filter @pe/api test
pnpm --filter @pe/api build
pnpm --filter @pe/worker test
pnpm --filter @pe/worker build
pnpm --filter @pe/web exec tsc --noEmit
pnpm --filter @pe/web build
pnpm --filter @pe/site exec tsc --noEmit
pnpm --filter @pe/site build
pnpm release:check
```

Pull requests should explain the problem, the chosen solution, test results, data or migration impact, and any remaining limitation.
