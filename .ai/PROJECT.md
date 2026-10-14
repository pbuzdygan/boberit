# Project Profile

## Required

- Goal and scope: Boberit is a self-hosted home archive for items and documents (purchase data, warranties, maintenance, attachments, local OCR, households) delivered as a responsive PWA in a single Docker container. Product direction: [docs/PRODUCT_BLUEPRINT.md](../docs/PRODUCT_BLUEPRINT.md); implemented behavior: code, [README.md](../README.md), and [CHANGELOG.md](../CHANGELOG.md).
- Required verification: from the repository root run `npm run build`, `npm run check`, `npm test`, and `npm run format:check` (fix with `npm run format`; on a clean checkout the web type check needs the `@boberit/shared` build output, so build first). For container changes also build the image (`docker compose -f compose_local_dev.yaml build`). Release images are built only by [.github/workflows/release.yml](../.github/workflows/release.yml) after a published GitHub Release.
- Protected resources and unsafe commands: never print, change, or commit `APP_ENC_KEY` or `.env*` files; changing the key makes stored webhook secrets undecryptable. The local test instance (`compose_local_dev.yaml`, ignored) binds real test data at `/srv/docker/boberit_test/data`; do not delete it, run `docker compose down -v`, or restore backups over it without explicit approval. Do not publish GitHub Releases or push images without explicit approval.

## Project constraints

- Precedence: code is authoritative for implemented behavior; the blueprint describes intended direction and is read only for product-scope work. Accepted decisions live in [.ai/decisions/](decisions/).
- Language: code, comments, and documentation in English. The UI is currently Polish only; English UI with a language switch is planned, so keep user-facing strings easy to extract.
- Node.js: `.nvmrc` pins major 26 to match the Dockerfile; on the dev VM nvm switches automatically (`nvm use` if not). Other projects keep the system Node.
- `compose.yaml` is the public example for users (prebuilt GHCR image); local builds after code changes use the ignored `compose_local_dev.yaml`.
- Release channels: release `X.Y.Z` targeting `main` publishes `latest`; prerelease `devX.Y.Z` targeting `dev` publishes `dev_latest`. The workflow file must also exist on `main`.
- Changelog: add entries only when asked; the user specifies the target version.
- Server layout: HTTP routes live in `apps/server/src/routes/` (one Hono router per area, mounted in `index.ts`); data access lives in `apps/server/src/db/`. Keep the single `DatabaseSync` instance, schema, and migrations in `db/database.ts`; other modules import it, never open their own connection.
- Web layout: screens in `apps/web/src/pages/`, shared UI in `apps/web/src/components/`, pure helpers in `labels.ts` and `format.ts`. Those helpers are unit-tested directly with `node --test`, so their relative value imports need the `.ts` extension; they may import components only as types.
- UI colors: [docs/COLOR_SYSTEM.md](../docs/COLOR_SYSTEM.md), implemented as CSS variables in `apps/web/src/styles.css`.
