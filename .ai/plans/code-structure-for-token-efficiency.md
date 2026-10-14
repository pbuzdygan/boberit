# Intended outcome

Source files that agents and humans can search and read in small, targeted ranges, without changing behavior. No TypeScript module above roughly 400 lines; each module has one responsibility.

Done: Prettier formatting, server split into `apps/server/src/routes/` and `apps/server/src/db/`, web split into `apps/web/src/pages/` and `apps/web/src/components/`. Measure current sizes with `wc -l` when resuming; do not record numbers here.

## Approach

1. **Hook extraction.** Reduce `apps/web/src/App.tsx` and `apps/web/src/pages/AssetDetail.tsx` to roughly 400 lines each by moving state and effects into custom hooks under `apps/web/src/hooks/` (session and households, data loading and refresh, navigation and unsaved-changes guards, notifications, search). Move code mechanically; extract pure logic into testable helpers with unit tests.
2. **Optional: split `apps/web/src/styles.css`** per page or component once the components settle. Keep the color variables from [docs/COLOR_SYSTEM.md](../../docs/COLOR_SYSTEM.md) in one place.

## Risks and verification

- No UI or API behavior changes: run `npm run test:e2e` before and after each step, plus the required checks from `.ai/PROJECT.md`.
- Large diffs conflict with parallel work: do each step as one isolated commit on `dev` when no other branch edits the same files.

## References

- [ADR-0001](../decisions/0001-modular-monolith-sqlite-filesystem.md) — module boundaries
