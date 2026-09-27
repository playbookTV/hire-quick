# Security reporting

Report suspected vulnerabilities privately to the repository owner or the team's established private security channel. This repository does not currently publish a dedicated security mailbox or response-time commitment; do not invent one. If a private vulnerability-reporting feature is enabled on the repository host, use it.

Include the affected revision/component, a minimal reproduction using synthetic data, expected/actual behavior, and impact. Exclude live credentials, tokens, OTPs, signed document URLs, and customer information from ordinary issue attachments. Coordinate restricted evidence sharing with the owner.

Do not test against live customer accounts, attempt money movement, or access unrelated private data to demonstrate a report. Use isolated test storage and provider test mode within the authorized scope.

Maintainers should preserve relevant audit/evidence, reproduce in isolation, review affected authorization and recovery paths, ship a tested fix, and rotate affected secrets where warranted. Follow [Operations](docs/OPERATIONS.md) for financial or audit incidents.

See [Security and privacy implementation](docs/SECURITY.md) for existing controls and known limits, and [Testing](docs/TESTING.md) for safe validation environments.
