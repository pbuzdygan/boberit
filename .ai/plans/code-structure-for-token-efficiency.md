# Intended outcome

Source files that agents and humans can search and read in small, targeted ranges, without changing behavior.

Baseline (2026-10-14): `apps/web/src/App.tsx` 935 lines / 142 KB (~35–40k tokens), `apps/server/src/index.ts` 289 lines / 40 KB, `apps/server/src/db.ts` 726 lines / 69 KB, `apps/web/src/styles.css` 740 lines / 78 KB; 84 source lines longer than 500 characters (whole endpoints on one line). Measure again with `wc -lc` and `awk 'length>160'` after each phase.

Acceptance criteria:

- No source line longer than the formatter's print width, except unavoidable literals.
- No TypeScript module above roughly 400 lines or 40 KB; each module has one responsibility.
- `npm run build`, `npm run check`, and `npm test` pass after every phase; no API, data, or UI behavior changes.

## Approach

1. **Formatter (one commit, formatting only).** Add Prettier as a root dev dependency (needs approval: new dependency and lockfile change) with `printWidth: 120`, single quotes, and semicolons to match the current style. Format `apps/*/src`, `packages/*/src`, and tests. Add the commit to `.git-blame-ignore-revs`. Add `npm run format` and `npm run format:check`; wire `format:check` into the required checks in `.ai/PROJECT.md`.
2. **Server split.** Move `index.ts` routes into Hono sub-apps under `apps/server/src/routes/` (auth, households, assets, documents, files, inbox, maintenance, trash, settings/webhooks, backup). Extract helpers: session/auth middleware, secret encryption, webhook delivery, upload validation. Split `db.ts` into schema/migrations, assets, documents, inbox, users/sessions/households, audit, backup, keeping the single `DatabaseSync` instance in one module.
3. **Web split.** Split `App.tsx` into `pages/` (Start, Items, ItemDetail, Documents, DocumentDetail, Timeline, Inbox, Trash, Settings, Auth), `components/` (Icon, dialogs, shared rows and forms), and `hooks/` (data loading, navigation). Move pure helpers (formatting, warranty labels) next to `labels.ts` with unit tests. Optionally split `styles.css` per page after the components settle.
4. **Update guidance.** Note the new layout in `.ai/PROJECT.md` only where it is not obvious from the tree.

Each phase is a separate commit or PR on `dev`, done when no other branch edits the same files.

## Risks and verification

- Large diffs conflict with parallel work: schedule each phase on a quiet branch and keep it mechanical (move code, no rewrites).
- The server is protected by `apps/server/tests/isolation.test.mjs` and the search tests; run them after every move.
- The web app has no UI tests: after phase 3, smoke-test login, Start, items, documents, deadlines, settings, and mobile navigation in a browser on a local instance with demo data (as done for the README screenshots). Compare the Vite bundle hash before and after phase 1; formatting alone should not change it.
- Rollback: each phase is an isolated commit that can be reverted.

## References

- Security review plan, which runs on the formatted code: [security-baseline-review.md](security-baseline-review.md)
- [ADR-0001](../decisions/0001-modular-monolith-sqlite-filesystem.md) — module boundaries
