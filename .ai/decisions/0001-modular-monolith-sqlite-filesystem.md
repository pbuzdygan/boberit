# ADR-0001: Modular monolith with SQLite and filesystem storage

- Status: accepted
- Date: 2026-10-14 (records a decision implemented since 0.1.0)
- Deciders: project owner
- Related work: [docs/PRODUCT_BLUEPRINT.md](../../docs/PRODUCT_BLUEPRINT.md)
- Supersedes: none

## Context

Boberit is self-hosted by households. Installation, upgrade, and backup must stay simple, and the data scale (thousands, not millions, of records) does not justify distributed services.

## Decision

- One TypeScript codebase in npm workspaces: React + Vite PWA (`apps/web`), Hono API on Node.js that also serves the web build (`apps/server`), shared contracts (`packages/shared`).
- One Docker image, one process, one `/data` volume.
- SQLite through `node:sqlite` in WAL mode, with FTS5 for full-text search over items, documents, and OCR text.
- Attachments on the local filesystem under random UUID names, separated per household (`items/`, `documents/`, `inbox/<household_id>`), served only through the authenticated API.
- Tesseract OCR runs locally in the same container.

## Consequences

### Positive

- Single-command deployment and a single backup unit.
- Transactions cover all domain data without distributed complexity.

### Negative or trade-offs

- Database and files can drift apart without staging and atomic finalization (planned).
- OCR shares CPU and memory with the API process.
- No horizontal scaling; S3 storage or a separate OCR worker would need new adapters.

## Alternatives considered

- Microservices or a separate worker: unjustified at household scale.
- PostgreSQL: an extra container and more complex backups for no practical gain.

## Security, migration, and rollback

- Security effect: household isolation must be enforced in every query and file path.
- Migration: schema and directory layout migrations run automatically on start.
- Rollback: restore a backup made with the previous version.

## Verification

`npm run check`, `npm run build`, `npm test`, and a container build.
