# Intended outcome

A first, evidence-based review of Boberit against [.ai/SECURITY.md](../SECURITY.md), with each control recorded as `verified`, `finding`, `not verified`, or `not applicable`, and a prioritized fix list. Review only: fixes become separate, approved tasks.

Scope: the application (`apps/server`, `apps/web`, `packages/shared`), container image, Compose example, and release workflow. Out of scope: host, reverse proxy/TLS, and GitHub account settings, except where the app makes assumptions about them.

Assets: household data and attachments, OCR text, credentials and sessions, webhook secrets, `APP_ENC_KEY`, and backups. Actors: anonymous network client, member, owner of another household, and a malicious file or webhook endpoint.

## Approach

Record detailed findings only in the local, ignored `.ai/SECURITY_FINDINGS.local.md` until reviewed for disclosure. This plan lists areas, not findings.

1. **Authentication and sessions:** password hashing parameters, token generation and storage in the browser, expiry and revocation, rate limiting and lockout for login and registration, account enumeration, first-run setup race.
2. **Authorization and tenancy:** owner-only operations, membership changes, active household switching. Cross-household access is already covered by `apps/server/tests/isolation.test.mjs`; extend it where gaps appear.
3. **Input and resource limits:** server-side validation of JSON bodies (types, lengths, enums, dates), search complexity, pagination, request body limits, concurrency of OCR and image processing.
4. **Files and backups:** upload type checks (browser MIME vs content), image re-encoding, filename handling, storage path resolution, download headers. Backup import: structure validation, stored names and paths, size and memory use, atomic replacement.
5. **OCR subprocesses:** argument passing, timeouts, page limits, temporary files.
6. **Webhooks and outbound requests:** URL validation, SSRF to private and loopback ranges, redirects, timeouts, response size, secret handling, delivery logs.
7. **Browser and HTTP:** CORS policy, security headers and CSP, service worker caching of authenticated responses, rendering of user content and URLs.
8. **Errors, logging, audit:** public error messages, request logging contents, audit coverage of security-relevant actions.
9. **Supply chain and container:** `npm audit`, lockfile and pinning, image user and capabilities, read-only root filesystem feasibility, health check, Trivy results from the release workflow.

Method per area: read the code path end to end, then confirm denial and failure cases with isolated fixtures (temporary data directory, never the real test instance). Add regression tests for confirmed issues when fixes are approved.

## Risks and verification

- Limits: no penetration test or external scanner beyond `npm audit` and Trivy; the report must say so.
- Deliverables: the completion checklist from `.ai/SECURITY.md` with evidence per item, and findings with severity, affected path, impact, and suggested fix.
- Order: run after phase 1 of [code-structure-for-token-efficiency.md](code-structure-for-token-efficiency.md) (formatting) so review is cheaper; apply high-severity fixes before the larger structural splits, and the rest after.

## References

- [.ai/SECURITY.md](../SECURITY.md)
- [ADR-0002](../decisions/0002-app-encryption-key.md) — secrets and session tokens
- [docs/PRODUCT_BLUEPRINT.md §10](../../docs/PRODUCT_BLUEPRINT.md) — product security requirements
