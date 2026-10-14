# Boberit — product blueprint

This document describes product intent: principles, target scope, UX direction, and quality goals. It is not a record of the current state. Implemented behavior is defined by the code, the [README](../README.md), and the [changelog](../CHANGELOG.md); durable technical decisions live in [.ai/decisions/](../.ai/decisions/).

- Distribution: self-hosted, single Docker container, mobile-first PWA.
- Language: Polish UI at launch; English with a language switch is planned.

## 1. Core loop

Boberit is a simple modular monolith with one shared core for items, files, tags, search, and reminders. It replaces day-to-day use of a small asset tracker (such as DumbAssets) and includes a lightweight document archive with local OCR. It deliberately does not copy the full scope of a document management system.

The product is not a large form but a reliable loop:

1. Save an item or a file within seconds, especially from a phone.
2. Complete the details now or later.
3. Connect the item with its receipt, manual, warranty, and deadlines.
4. Find everything with one search, without remembering any folder structure.
5. Get a reminder and record that the task was done.

## 2. Brand and positioning

**Boberit** — *One place for everything that matters. Save it now. Find it later.*

Promise: "Boberit remembers what you own, where the proof of purchase is, when the warranty ends, and what needs doing later."

Three pillars:

- **Capture** — adding from a phone must be faster than postponing it.
- **Connect** — an item, its files, warranty, and tasks form one context.
- **Recall** — search works with whatever the user actually remembers.

UI personality: calm, neutral, and tool-like, with a limited palette, few visual levels, and high density of useful content.

- Cool light background and white surfaces; one blue action color; red and green only for states (see [COLOR_SYSTEM.md](COLOR_SYSTEM.md)).
- Locally hosted Inter; no decorative headings.
- Compact lists are the main management view, without photos or covers; a photo belongs to the record detail.
- Thin borders, almost no shadows, no space-consuming illustrations.
- Touch targets keep the accessible minimum while rows stay visually compact.
- Icons come from a single locally stored set (Tabler Outline); no CDN or icon fonts.
- The approved v2 mark (`branding/boberit-icon.png`, `branding/boberit_banner.png`) is a box/folder for important things that turns into a beaver's cross-hatched tail: a professional symbol, not a mascot, in electric blue, cobalt, navy, and cool silver without warm colors. Do not change its construction, colors, or the banner's character without a new product decision.

## 3. Users and problems

Primary user: a person or household that buys devices and wants to keep their information, receipts, manuals, warranties, and task history without running an enterprise asset system.

Jobs to be done:

- When I buy a device, I want to save the basics quickly and photograph the receipt.
- When a device breaks, I want to find its serial number, warranty, and proof of purchase.
- When a deadline approaches, I want a reminder about a filter, an inspection, or warranty expiry.
- When I remember only part of a name, the brand, the room, or a tag, I want to find the item.
- When I only have a photo or a PDF, I want to keep it now and sort it later.

Friction to remove: unreliable phone uploads, long forms before the first save, search that requires exact names, context split between an asset app and a document archive, mixing a maintenance plan with the fact of completing it, and no clear "saved but incomplete" state.

## 4. Product principles

1. **Safe save first.** A name or a single file is enough to create a record.
2. **Progressive disclosure.** Detailed fields appear in logical sections, not in one wall of inputs.
3. **One search.** Plain words always work; advanced syntax is optional.
4. **Originals are immutable.** Thumbnails, OCR text, and indexes are derived data.
5. **A deadline and its completion are different things.** A maintenance plan produces completions and the next due dates.
6. **Self-hosting without penalty.** Backup and restore never require knowledge of the internal database structure.
7. **Mobile-first, not mobile-only.** The phone captures; the desktop organizes.
8. **No AI on the critical path.** OCR and suggestions may help, but saving and basic search work locally without external services.
9. **Original work.** Reference products inspire problems and domain patterns only; no copying of their UI, naming, or GPL/AGPL code and assets.

## 5. Information architecture

Navigation: **Start**, **Items**, **Documents**, **Deadlines**, **To assign**, **Trash**, **Settings**.

Domain vocabulary (Polish UI term in brackets):

- **Item** (Przedmiot) — a physical thing; never "asset" in the UI.
- **Deadline** (Termin) — the shared entry point for warranties and maintenance.
- **Maintenance plan** — a one-off or recurring rule; **completion** — a task actually performed.
- **File** — a physical upload; **document** — a standalone record with its own metadata and attachments.
- **To assign** (Do przypisania) — captured files waiting to be attached to an item or turned into a document.

## 6. Target scope

### Items and files

- Name, manufacturer, model, serial number, purchase date, price and currency, quantity, warranty, external link, tags, notes.
- Planned: status (active, sold/given away, disposed, lost), an automatic "needs completion" marker, duplicating, and a stable direct URL to the detail.
- Files: photo, receipt, manual, warranty, other; several at once from the camera, photo library, or system file picker.
- Planned: visible per-file progress with retry and cancel, MIME detection by signature, SHA-256 checksums, duplicate detection that never discards the user's intent.

### Warranties and maintenance

- Warranty scope; an expiry date or lifetime, never both; computed state (active, ending, expired, lifetime, unknown).
- One-off or recurring plans every N days/weeks/months/years using calendar semantics; completion with date and notes; history survives plan edits.
- Planned: configurable reminder thresholds globally and per item, pause/resume, skipping a due date with a reason, choosing whether the next date counts from the due date or the completion.

### Search and organization

- Full text across item fields, tags, notes, document metadata, and OCR text; results update while typing.
- Planned: explanation of why a result matches; filter chips (tag, status, warranty, deadline, manufacturer, purchase date, price, missing data) reflected in the URL; sorting by relevance, recency, name, price, warranty end, or next task; saved views.
- Optional advanced syntax, never required:

  ```text
  tag:kitchen bosch
  serial:AB12
  warranty:<30d
  maintenance:overdue
  purchased:>=2025-01-01
  status:active -tag:sold
  ```

### Deadlines and notifications

- One timeline for warranties and maintenance, grouped as overdue, next 7 days, 30 days, later.
- In-app notifications and webhooks today; idempotent jobs never send the same notification twice after a restart.
- The household time zone, not the container's, is the source of user-facing dates.

### Roadmap

- Offline drafts and an upload queue that works without network.
- Member invitations by e-mail.
- Sign-in through an external provider, e.g. Authentik/OIDC.
- Streaming uploads, content-based MIME checks, checksums, and atomic finalization (see §8).
- Optional Web Push and e-mail notifications alongside webhooks.
- Import adapters for defined external formats, starting with DumbAssets (see §12).
- Parent/child relations (device and components), QR labels, location/room as its own dimension, custom fields per household, bulk operations, read-only sharing of a single item.
- Documents: correspondent/issuer and document date, automatic tagging rules, mail inbox and watched folder, API keys, expiring password-protected shares, optional encryption at rest.
- Automated E2E and visual regression tests.

### Out of scope

Accounting and depreciation, advanced inventory management, MDM or network device discovery, native and desktop apps, an integration marketplace, generative search as the only interface to data.

## 7. Key UX flows

**Quick add from a phone.** A persistent add action offers: take a photo, choose a file, add an item manually. After a photo the user enters only a name or saves it to *To assign*. Upload shows progress and confirmation that the server stored it; the system then suggests small next steps (manufacturer/model, purchase/warranty, deadlines). Closing the screen never loses a saved record. Target: median under 20 seconds from opening the form to a safely saved record.

**Full item entry.** Four collapsible sections: basics; purchase and warranty; files and organization; care (first maintenance plan). Saving is possible at any stage; validation blocks only contradictory data, e.g. both an expiry date and lifetime warranty.

**Finding things.** Search is available on every page. Typing `bosch filter` searches all basic fields; suggestions show items, tags, manufacturers, and ready filters. Filters work without syntax knowledge and are reflected in the URL; browser back restores the query and list position.

**Completing maintenance.** The deadline appears on Start and in Deadlines. "Mark as done" lets the user change the date and add a note, cost, and photo, shows the computed next date before confirming, and updates the item history while the plan stays active.

**Warranty claim.** Search by serial or name; the detail shows a clear warranty state, the receipt and warranty terms, one-click download of originals, and copying of the serial number; a service event can be added with the received report.

## 8. Reliable mobile upload

An architectural requirement, not UI polish. Target flow:

1. The client creates a local entry with an identifier in the `queued` state.
2. The server creates an upload session with limits and an idempotency key.
3. Files are sent one by one, so one failure does not invalidate the others.
4. The server streams data to a temporary directory on the same filesystem as the target store.
5. The server detects the real MIME type, computes SHA-256, and rejects disallowed files.
6. Finalization performs an atomic rename and a metadata transaction.
7. Only a `committed` response is shown as "Saved".
8. Unfinished files can be retried; a periodic job removes orphaned temporary files.

UX requirements: separate "Take photo" and "Choose file" buttons instead of relying on one `accept` attribute; warn before closing during an active upload; keep form metadata before uploading; show specific errors (limit, type, no space, connection lost, server error); test Safari on iOS and Chrome on Android on real devices, including HEIC and files from system cloud providers.

## 9. Search quality

Normalization ignores case and diacritics for matching while preserving the original text. Proposed ranking weights: exact serial number, exact model, name prefix, name and manufacturer, tag, notes, OCR text.

Interface rules: Enter is never required; advanced syntax gives hints and a readable error instead of an empty list; filter tokens are removable with one click; the URL holds search state so a result can be shared with a household member; empty results suggest removing the narrowest filter; serial numbers have a copy button.

## 10. Security, backup, and operations

Security requirements specific to Boberit (the general baseline is in [.ai/SECURITY.md](../.ai/SECURITY.md)):

- Authorization per household for every record and file; the household always comes from the session, never only from client input.
- Random, unpredictable storage keys; files are never exposed through a static server; a file name is never a path.
- Rate limiting for sign-in and uploads; size, count, and total disk limits.
- Audit log of critical operations.
- Export and backup contain private data and should require re-authentication.

Backup goals: a consistent SQLite snapshot through the backup API (never copying a live file), a manifest with schema version and non-secret settings, checksum verification, an automated restore test into an empty directory, and exports readable without Boberit.

Observability goals: structured logs with a request ID and without notes or file names by default; an owner-only diagnostics screen (version, database size, file count, last backup, job status) that never exposes paths, secrets, or user data; analytics only local and opt-in.

## 11. Quality targets

| Area | Target |
|---|---|
| Phone start | usable UI in ≤ 2.5 s on a typical home network |
| Search | p95 ≤ 250 ms for 50k records without OCR |
| Metadata save | p95 ≤ 500 ms locally |
| Upload | streaming, never buffering a whole file in RAM |
| Accessibility | WCAG 2.2 AA for core flows |
| Responsiveness | 360 px to large desktop, no horizontal scroll |
| Browsers | current Safari iOS, Chrome Android, Firefox and Chromium desktop |
| Reliability | a restart during a job never duplicates notifications |
| Dates | user dates as local dates, timestamps in UTC |
| Localization | texts outside component code |

Test strategy:

- **Unit:** warranty dates including lifetime, calendar arithmetic for days/weeks/months/years, DST and the Europe/Warsaw zone, completeness rules, search parsing, household permissions, import mapping.
- **Integration:** upload from session to atomic file, database rollback on failed finalization, index updates after tag changes, idempotent notifications, backup and restore, migrations from every supported version.
- **E2E:** quick add on phone viewports, several files with one failing, search by serial/tag/note, creating and completing a plan, session expiry during editing, keyboard-only use and basic screen reader checks.
- **Real devices:** viewport emulation is not enough. Before a release check the camera, file picker, HEIC, photo rotation, interruption, and returning from background on at least one iPhone and one Android phone.

## 12. Data migration

**DumbAssets → Boberit.** A two-phase importer: *preview* reads `Assets.json`, `SubAssets.json`, and file directories, normalizes dates, currencies, quantities, and event types, and produces a report; *execute* writes the data in one logical transaction, copies files through the normal file pipeline, and stores a `source_id → boberit_id` map. Unknown fields go to the report and an optional legacy payload so nothing disappears silently; re-running with the same identifier never creates duplicates.

**Papra → Boberit.** Prefer the official API/CLI or a stable export over reading Papra's database. Keep each original, name, date, tags, extracted text (as derived data), and checksum. No two-way synchronization: it would create conflicts and split responsibility.

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Scope grows toward a full DMS | core loop suffers | firm scope boundaries; documents reuse shared files/tags/search |
| Upload works on desktop but not on phones | loss of trust | real devices, session-based pipeline, clear retry |
| SQLite and files drift apart | orphaned data | staging, atomic commit, reconciler, backup manifest |
| Wrong monthly deadlines | wrong reminders | local dates, calendar arithmetic, month-end tests |
| Self-hosted auth underestimated | private data leak | proven primitives, threat model, tenant isolation tests |
| Over-generic "everything is an element" model | hard domain rules | separate item and document entities; only files, tags, and search shared |
| Import loses historical fields | data loss | preview, legacy payload, report, idempotent map |
| AI becomes a dependency | no local/offline operation | AI only as an optional adapter |

## 14. Success metrics

Computed locally and shown only to the owner: median time to save a record, upload success and retry rate, share of items with at least one file, share of searches ending in an opened result, empty results, overdue deadlines, share of incomplete records finished within 7 days, date of the last verified backup.

Never optimize the number of filled fields at the cost of saving speed. The key qualitative measure: "When I needed it, I found it without thinking about where I saved it."
