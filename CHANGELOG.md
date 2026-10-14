# Changelog

Changes are described from the user's perspective, without implementation details.

## 0.1.1

### Improvements

- Local image builds and vulnerability scans have commands with RAM and CPU limits and a lock that prevents concurrent heavy tasks.
- Release images pick up Debian package updates on every build, including libraries inherited from the base image.

### Bug fixes

- Search finds fragments from the middle of words, including OCR text, regardless of letter case.
- Search results no longer change collection counters or the content of other screens; navigating through the menu ends the search, and the field can be cleared with the × button or the Escape key.

## 0.1.0

### Features

- Items store purchase data, warranty, tags, notes, and multiple attachments.
- Item attachments can be downloaded and deleted individually.
- Maintenance supports one-off and recurring plans, editing and deleting them, marking tasks as done, and a task history.
- Deadlines combine upcoming warranties and maintenance in one view.
- To assign lets you bulk import files and then assign them to items or turn them into standalone documents.
- Documents are shown in a compact table and can contain multiple files.
- Document details bring together metadata, attachments, preview, download, file deletion, and OCR.
- Local OCR recognizes Polish and English text in images and PDFs, supports re-recognition, and allows manual correction of the text.
- One search covers items, documents, tags, and OCR text.
- Trash lets you restore an item or document for 30 days or permanently empty deleted entries.
- Boberit supports local accounts, multiple households, and owner and member roles.
- An owner can create member accounts, change roles, and revoke access to a household.
- Settings provide backup, data restore, and the activity history of the active household.
- Webhooks can be created, edited, and deleted, with their households and event types configured independently.
- Boberit can be installed as a PWA on a phone or computer.

### Improvements

- Setting a purchase date can automatically prepare a two-year warranty with a fixed end date.
- Editing an item warns before leaving the view with unsaved changes.
- Start shows the number of saved items and documents, used storage, and the total purchase value of the active household.
- The "Needs attention" and "Recently saved" sections use a two-column layout on wide screens and consistent, compact rows.
- The notification center shows deadlines due today and the history of UI actions; the red badge disappears after today's entries are read.
- Messages after operations disappear automatically after three seconds.
- Image processing and OCR have limited parallelism and caching to run more reliably on servers with less RAM.
- Navigation uses the order Start, Items, Documents, Deadlines, and To assign; Trash sits next to Settings.
- Item filters show the number of matching records and are left-aligned.
- Documents have compact rows, clear OCR statuses, and a counter of pending OCR operations.
- Settings and the user profile have a separate section menu instead of one long card.
- Mobile views use consistent icon colors and compact form layouts.
- The sign-in screen shows the full Boberit banner above the form.
- Icons, favicon, Apple Touch Icon, and PWA variants are served locally.

### Bug fixes

- The item detail layout no longer overlaps form fields at intermediate screen widths.
- Attachments added while creating an item or document are correctly assigned to the created record, also in the mobile view.
- Completing maintenance saves the history, computes the next due date of a recurring plan, and removes a completed one-off task from the task list.
- Deleting a document file updates its OCR text, so removed content no longer appears in search results.
- Today's deadlines appear in the notification center after the app data refreshes.
- Clearing the search field keeps the user in the view where the search started.
- The sign-in form on iPhone no longer zooms the page automatically.
- The API and attachments are not accessible without signing in or from another household.
- The interface no longer uses an inconsistent purple background or different icon coloring in the mobile view.
- The encryption key is no longer hard-coded in the Compose configuration.

### Distribution

- Release images include an SBOM and provenance information and are scanned for HIGH and CRITICAL vulnerabilities on AMD64 and ARM64.
- Container images are built only after a GitHub Release is published.
- A release from `main` publishes `latest` and the version tag `X.Y.Z`.
- A prerelease from `dev` publishes `dev_latest` and the tag `devX.Y.Z`, without modifying production tags.
