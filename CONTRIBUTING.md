# Contributing to HireQuick

Start with [Local setup](docs/GETTING_STARTED.md), [Architecture](docs/ARCHITECTURE.md), and the repository's [AGENTS.md](AGENTS.md). Use [the documentation index](docs/README.md) to find feature and operational guidance.

## Change workflow

1. Inspect the current working tree and preserve unrelated changes. Use a focused branch; agent-created branches default to `codex/` unless instructed otherwise.
2. Define the concrete behavior being changed. Read the cited PRD/TRD section before altering money, escrow, policy, or a state transition.
3. Follow existing feature boundaries and shared contracts. Financial writes go through the ledger engine. Use `.js` in backend/shared relative imports and `@hq/database` for application database access.
4. Add focused tests for changed behavior, especially authorization, concurrency, retries, and recovery. Use disposable storage for database-backed suites.
5. Update implementation docs and examples in the same change. Preserve dated historical reports; add new evidence for new runs.
6. Run relevant package checks, test-source checks, and `pnpm docs:check`. Before merge, satisfy [CI](.github/workflows/ci.yml). See [Testing](docs/TESTING.md) for the exact sequence and environment.

## Pull requests

Lead with the problem and resulting behavior. Include the affected app/module, meaningful implementation decisions, commands/results actually verified, migration/deployment requirements, and remaining limitations. For UI changes include suitable sanitized screenshots/device evidence; for financial changes include concurrency/recovery evidence. Do not claim tests passed if they were not run.

Keep unrelated formatting or generated output out of a focused change. Commit tracked Prisma migrations with schema changes. Never commit secrets, private user data, or signed object links. Document a blocked check and its cause rather than bypassing it.

## Documentation changes

Use Markdown under `docs/` for current engineering guides and `documentation/` for canonical specifications or dated records. Update the relevant index. Link to the source of material implementation claims and distinguish policy intent from supported execution. Examples should state the working directory, required environment, placeholders, and whether they mutate a database or contact a provider.

`pnpm docs:check` validates maintained local links. It does not prove API contract accuracy or execute setup commands; review those against source. Use targeted Prettier formatting on changed documents instead of formatting unrelated files.

## Reporting issues

Provide the affected app/revision, reproduction steps, expected/actual result, environment/provider mode, and sanitized error/request ID. For a possible vulnerability, use [Security reporting](SECURITY.md) rather than publishing exploit details or sensitive records in a public issue.
