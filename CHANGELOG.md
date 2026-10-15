# Changelog

Changes are described from the user's perspective, without implementation details.

## 0.2.0

### Security

- Only a household owner can download a backup, restore data, or permanently empty the trash. Downloading and restoring a backup ask for the owner's current password and are recorded in the household history; API clients must now request the backup with `POST` and the password.
- Restoring a backup checks the whole package first and changes only the household being restored. If anything fails, the household keeps its current data and files.
- Restored attachments accept the same file types as uploads. Only images, PDFs, and plain text open as a preview; other files are downloaded.
- After repeated failed sign-ins, further attempts for that login pause for 15 minutes; other users can still sign in.
- Oversized requests are rejected before they are processed.
- Webhooks are sent only to public internet addresses, without following redirects and with a 10-second timeout. A service in the local network can be allowed with `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true`.
- The app sends browser security headers, including a Content Security Policy, and other websites can no longer call its API from a browser.
- Error messages no longer reveal technical details: unexpected errors show a general message, and failed text recognition shows a general reason. API clients receive HTTP 500 for unexpected errors and HTTP 400 for every validation error.
- The container image reports its health to Docker. The example `compose.yaml` drops unneeded privileges and sets memory, CPU, and process limits.
- Passwords are stored with stronger hashing. Existing passwords are upgraded automatically at the next sign-in.
- Uploaded and restored files must match their declared type; for example, a file sent as PDF must really be a PDF.
- The household history records added, promoted, demoted, and removed members, webhook changes, and sign-in lockouts after repeated failed attempts.
- Every request is checked for valid field types, lengths, dates, and choices; too long text and invalid dates get a clear message. Trashed documents and maintenance plans of trashed items can no longer be edited until they are restored.
- Text recognition (OCR) is shared fairly between households, and a household can queue only a limited number of files at a time.
- Creating the first account requires a one-time setup code printed in the server log (`docker compose logs boberit`), so a new instance cannot be claimed by whoever reaches it first. Automated setups can provide their own code with `SETUP_TOKEN`.

### Improvements

- "OCR of pending documents" processes up to 25 documents per run, about one minute at most, and reports how many are left, so long runs no longer time out.
- Larger text, clearer form labels, and consistent icons make the app easier to read and navigate.
- Settings bring household and account options together, making members, categories, backups, security, and integrations easier to find.
- The new About section in Settings shows your installed version and release channel, and lets you check for available updates and open their release notes.
- Item details give warranty information more room and let you add maintenance plans from a separate dialog.
- Phone layouts keep important actions within reach and show warranty information directly in the item list.
- Dialogs and file pickers work with the keyboard, and screen readers announce action results.
- Loading indicators, retry buttons, and shortcuts to add the first item or document make it clearer what to do next.
- Household history is grouped by day and can be filtered to find relevant changes faster.
- Webhook changes are saved together from one dialog, so it is clear when they take effect.
- Deadlines show the next occurrence of recurring maintenance in advance, with counts for each filter and years on dates.

### Bug fixes

- Failed uploads, saves, and deletions now show an error; adding a maintenance plan keeps your input if saving fails.
- Loading or a connection error no longer makes an existing collection appear empty.
- On phones, the inbox fits the screen and its Import button remains accessible.
- Documents without attachments no longer appear to be waiting for text recognition.
- Previewing an attachment no longer opens an extra blank tab, and text files show Polish characters correctly.
- Small attachments in item details show their size in KB instead of "0.0 MB".
- Adding a household member with a login or e-mail address that is already in use shows a clear message.
- If a webhook secret can no longer be decrypted (for example after `APP_ENC_KEY` was changed), changes are still saved and the webhook delivery list explains why the webhook was not sent.
- Household history entries for password changes and signing out other sessions read correctly.

- Deadlines show the correct number of days: a task due today is labeled "Today" instead of "Tomorrow", and the warranty banner and deadline lists always agree.
- Dates around midnight follow the local calendar day, including the default completion date of a maintenance task.
- Recurring maintenance intervals use correct Polish wording, such as "Every year", "Every month", or "Every 5 years".
- On phones, the Start screen shows the full purchase value instead of a truncated amount, with the summary tiles in an even grid below the greeting.

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
