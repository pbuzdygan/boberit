# Intended outcome

The web UI conforms to [UI_DESIGN_GUIDELINES.md](../UI_DESIGN_GUIDELINES.md): no silent failures, correct dates, no horizontal scroll on phones, distinct loading/empty/error states, keyboard-accessible dialogs and file pickers, readable desktop typography, consistent icons and colors, and one coherent settings structure. Implemented in small steps; the user reviews and commits each step.

Audit from 2026-10-15 (desktop 1366 px, phone 390 px, isolated instance with demo data). Findings are numbered; the numbers are referenced in step summaries. Tick a finding only when its step is verified.

## Findings and progress

### Step 1 — functional bugs (done)

- [x] F1 Silent failures (§16): about 11 async actions are called as `void onX()` without error handling (trash restore/empty, inbox assign/delete, asset/document file upload and delete, plan add/delete, plan completion, file classification, document edit dialog, webhook delete). The new-plan form clears even when saving fails. Fix: actions report errors as a toast; forms keep input on failure; busy states.
- [x] F2 Dates "Dodano/Usunięto" use the UTC date (`createdAt.slice(0, 10)`), so 00:00–02:00 local time shows the previous day (item detail, documents, inbox, trash). Fix: format timestamps in local time via a tested helper in `format.ts`.
- [x] F3 Inbox at 390 px overflows to ~632 px; the Import button is off-screen (§17). Also fixed: a phone rule hid every `.page-heading .primary`, which made Import unavailable on phones.
- [x] F5 Backup restore shows the native, unstyled English "Choose File / No file chosen" (`.restore-file` has no styles).
- [x] F17 Documents without a file show the "OCR pending" icon; show "—" instead.

### Step 2 — loading, empty, and error states (done)

- [x] F4 Start shows zeros and "Kolekcja jest jeszcze pusta" while loading and after a failed load; an empty collection shows the filter message "Brak pasujących… wyczyść filtry" without an add action (items, documents); load errors appear only as a 3 s toast. Separate loading / error with retry / empty with action / no filter match. New empty-state copy is shown to the user before implementing.
- [x] F4b Failed loads are still unreported: document types (quick add, documents, document detail, inbox, edit dialog), asset options, activity and storage, households and webhooks lists. Use `useReportError` or an inline error with retry.
- [x] F14 Search with no results shows "Przedmioty 0" and "Dokumenty 0" headings plus the empty state; hide empty sections.

### Step 3 — accessibility and forms (done)

- [x] F6 Dialogs (quick add, completion, plan edit, document edit) lack `role="dialog"`, Escape, and focus handling; file inputs hidden with `display: none` (Import, Zrób zdjęcie, Wybierz plik, document menu Dodaj plik) are unreachable by keyboard; the toast has no live region.
- [x] F8 Placeholder-only fields (members, security, webhooks, inbox document fields); tiny "opcjonalnie" hints (§12).
- [x] F9b Backup: "Wybierz backup" and "Zastąp dane backupem" touch without a gap.
- [x] F9 Disabled buttons look like empty fields (Zapisz dane, Przypisz, Utwórz konto).

### Step 4 — typography (approved: larger desktop text)

- [ ] F7 Desktop text is 8–11 px (inputs 11 px, metadata down to ~7 px); target body 14 px, metadata ≥ 12 px (§5). Keep Inter (variable, already self-hosted) unless readability at the new sizes requires a change. Introduce type-scale tokens; deduplicate the touched rules in `styles.css` with before/after screenshot comparison.

### Step 5 — icons, colors, small consistency fixes

- [ ] F10 Icon semantics: Ustawienia/Webhooki use "dots", Członkowie uses "package", Do przypisania reuses "file-text", OCR status uses calendar/shield. Add a few SVGs in the same stroke style.
- [ ] F11 "W naprawie" uses the danger color; the warranty attention card is red on Start and blue on Items; the decorative "⋯" on item rows suggests a menu that does not exist.
- [ ] F15 Activity shows "0.0 MB" while Start shows "154 B" (use `formatStorage`); activity list is unbounded.
- [ ] F16 Timeline: date tiles lack the year for dates outside the current year; "Nadchodzące terminy" also counts overdue entries; filters lack counts.
- [ ] Timeline decision (approved): a recurring plan completed at least once shows its next due date on Terminy (today it is hidden until due). Start/notification reminders keep the 30-day window.

### Step 6 — item detail

- [ ] F12b Warranty card fields (scope, end date) have no visible labels; label them in the redesign.
- [ ] F12 Warranty card is a dark gradient with shadow, unlike other panels, and on phones sits below the whole plan form; the add-plan form is always expanded; plan rows are cramped. Needs approval of the layout before implementing.

### Step 7 — phone layout

- [ ] F13 Two add buttons (top bar and bottom bar); the item list hides warranty but shows status; the OCR batch button wraps to three lines; the detail heading badge wraps; "Zrób zdjęcie" shows on desktop. Needs approval of the layout before implementing.

### Step 8 — settings structure (approved: rebuild now)

- [ ] F18 Household settings are split: Backup and Historia under "Ustawienia", Członkowie and data dictionaries under "Moje konto". Target: "Ustawienia" holds everything about the active household (dictionaries, members, backup, history); "Moje konto" holds the user's households list, security, and webhooks. Remove the card-in-card nesting of dictionaries. Navigation proposal is shown to the user before implementing.
- [ ] F18b Inline "add" fields in households and data dictionaries rely on placeholders ("Np. Garaż"); give them labels in the rebuild.
- [ ] F19 Webhooks mix autosaving checkboxes with an explicit save and auto-enter edit mode for a single webhook; members show the create form above the list, always expanded.
- [ ] F20 Naming: "Do przypisania" vs "Pliki w Skrzynce" vs "Masowy import" vs "Import"; "Dokumenty niezależne". Wording is shown to the user before implementing.

## Risks and verification

- Each step: before/after screenshots with `node .tmp/ui-audit/shoot.mjs .tmp/ui-audit/<dir>` (isolated temporary instance, never real data), then `npm run build`, `npm run check`, `npm test`, `npm run format:check`, `npm run test:e2e`.
- `styles.css` has duplicate selectors and many `@media` blocks; later rules win, so merging changes the look. Compare screenshots for every touched rule.
- Keep user-facing strings easy to extract for the planned English UI.

## Cleanup after the last step

- Delete `.tmp/ui-audit/` (screenshot script and images; ignored by Git).
- Delete this plan file once all findings are done or explicitly dropped.

## References

- [UI_DESIGN_GUIDELINES.md](../UI_DESIGN_GUIDELINES.md), [COLOR_SYSTEM.md](../../docs/COLOR_SYSTEM.md)
- Screenshot script: `.tmp/ui-audit/shoot.mjs` (local, ignored)
