# Intended outcome

Source files that agents and humans can search and read in small, targeted ranges, without changing behavior. No TypeScript module above roughly 400 lines; each module has one responsibility.

Done: Prettier formatting, server split into `apps/server/src/routes/` and `apps/server/src/db/`, web split into `apps/web/src/pages/` and `apps/web/src/components/`, state and effects of `App.tsx` and `AssetDetail.tsx` moved into `apps/web/src/hooks/` with pure logic in `collections.ts` and `assetForm.ts`. Measure current sizes with `wc -l` when resuming; do not record numbers here.

## Approach

1. **Optional: split `apps/web/src/styles.css`** per page or component once the components settle. Keep the color variables from [docs/COLOR_SYSTEM.md](../../docs/COLOR_SYSTEM.md) in one place.

## Risks and verification

- No UI or API behavior changes: run `npm run test:e2e` before and after each step, plus the required checks from `.ai/PROJECT.md`.
- Large diffs conflict with parallel work: do each step as one isolated commit on `dev` when no other branch edits the same files.

## References

- [ADR-0001](../decisions/0001-modular-monolith-sqlite-filesystem.md) — module boundaries
