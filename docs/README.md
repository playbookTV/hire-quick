# Documentation guide

Implementation guides reviewed against the repository on **2026-09-16**. They describe source behavior; they do not certify a running deployment or a successful production rollout.

## Reading paths

For API/worker errors, request timing, uptime, and job alerts, start with [Observability](OBSERVABILITY.md).

| Your task               | Read in order                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Run the project         | [Local setup](GETTING_STARTED.md) → [Configuration](CONFIGURATION.md) → [Troubleshooting](TROUBLESHOOTING.md)                |
| Make a change           | [Architecture](ARCHITECTURE.md) → [Development](DEVELOPMENT.md) → [Testing](TESTING.md) → [Contributing](../CONTRIBUTING.md) |
| Work on a feature       | [Workflows](WORKFLOWS.md) → [API](API.md) → [Data model](DATA_MODEL.md)                                                      |
| Work on money           | [Payments](PAYMENTS.md) → [Current status](STATUS.md) → [Operations](OPERATIONS.md)                                          |
| Release and support     | [Deployment](DEPLOYMENT.md) → [Operations](OPERATIONS.md) → [Security](SECURITY.md)                                          |
| Understand requirements | [Specification index](../documentation/README.md) → relevant PRD/TRD/UXRD sections                                           |

## Which document is authoritative?

- **Product intent:** the Executive Summary, PRD, UXRD, and TRD under `documentation/`. Read cited sections before changing money, policy, or state transitions. A spec describes intended behavior, which may not yet be implemented.
- **Implemented behavior:** current route handlers, shared validators/state tables, Prisma schema and migrations, and executable tests. These guides link to those sources. If implementation differs from a specification, record the gap in [Current status](STATUS.md); do not silently redefine the product.
- **Operational configuration:** current deployment settings and provider configuration must be checked by the operator. Repository examples are not a record of deployed secrets or infrastructure.
- **Historical evidence:** dated reviews, orchestration records, and validation reports under `documentation/` describe a particular run. Preserve them and add new evidence instead of rewriting history.
- **Agent instructions:** [AGENTS.md](../AGENTS.md) governs repository work. It is not an API contract or a replacement for these guides.

## Keep documentation current

Update docs in the same change that alters behavior:

| Change                               | Documents to check                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Route, response, authorization       | [API](API.md), [Workflows](WORKFLOWS.md), relevant tests                                                                         |
| Environment variable or default      | [Configuration](CONFIGURATION.md), [root example](../.env.example), app examples                                                 |
| Money, state, cancellation, recovery | [Payments](PAYMENTS.md), [Data model](DATA_MODEL.md), [Operations](OPERATIONS.md), [Status](STATUS.md), referenced specification |
| Job, alert, deployment               | [Operations](OPERATIONS.md), [Deployment](DEPLOYMENT.md)                                                                         |
| Dependency or build/test script      | [Local setup](GETTING_STARTED.md), [Development](DEVELOPMENT.md), [Testing](TESTING.md)                                          |
| Security or privacy behavior         | [Security](SECURITY.md), [compliance records](../documentation/compliance)                                                       |

Use relative links, runnable commands with their working directory stated, and synthetic examples. Label planned work explicitly. Never publish credentials, tokens, OTPs, signed document links, customer data, or unredacted connection URLs in examples or evidence.

Run `pnpm docs:check` to check local file and Markdown heading links in the maintained guide set, then review changed commands and contracts against their source. The checker does not execute examples, check external websites, validate diagrams, or establish that deployment instructions succeeded.
