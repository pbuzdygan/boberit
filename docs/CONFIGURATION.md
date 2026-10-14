# Configuration and data

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `APP_ENC_KEY` | yes | — | 64 hex characters (`openssl rand -hex 32`). Encrypts webhook secrets with AES-256-GCM and keys session token hashes. |
| `APP_PORT` | no | `3219` | Host port published by `compose.yaml`. The container listens on `3000`. |
| `TZ` | no | `UTC` | Server time zone as an IANA name, e.g. `Europe/Warsaw`. Sets the server's notion of "today" for date-only values (see below). |
| `PUID` / `PGID` | no | `1000` | User and group the container runs as; set them to the owner of a bind-mounted data directory. |
| `WEBHOOK_ALLOW_PRIVATE_NETWORKS` | no | `false` | Set to `true` to let webhooks reach private network addresses (for example a Home Assistant or ntfy server in your LAN). Loopback, link-local, and cloud metadata addresses stay blocked. |

Keep `APP_ENC_KEY` in an environment variable or in the Git-ignored `.env` file; Compose refuses to start without it. Keep a secure copy of the key separately from Boberit backups: backups do not contain it, and losing or changing it makes stored webhook secrets undecryptable (webhooks with a secret must then be saved again) and invalidates all active sessions.

## Time zone

Dates such as purchase dates, warranty expiry, and maintenance due dates are calendar dates without a time. The web app shows deadlines ("today", "in 6 days") using the browser's time zone. The server uses `TZ` only where it has to decide what "today" is on its own, currently the completion date of a maintenance task when the client sends none. Set `TZ` to the household's zone (for example `TZ=Europe/Warsaw` in `.env`) so that server-side dates match what users see; the default `UTC` can be a day off around midnight. Timestamps such as creation times are always stored in UTC.

## Data layout

All persistent data lives in `/data` inside the container (the `boberit-data` volume in `compose.yaml`):

- `db` — SQLite database in WAL mode;
- `items/<household_id>`, `documents/<household_id>`, `inbox/<household_id>` — attachments, separated per household.

Older layouts, including the legacy `uploads` directory, are migrated automatically on the first start of a newer version.

To use a host directory instead of the named volume, set `PUID` and `PGID` to its owner:

```bash
printf 'PUID=%s\nPGID=%s\n' "$(id -u)" "$(id -g)" >> .env
sudo chown -R "$(id -u):$(id -g)" /path/to/data   # only once, for an existing directory owned by someone else
```

## Uploads

- Only allowed file types are accepted, up to 25 MB per file. The content must match the declared type (PDF, Word, plain text, JPEG, PNG, WebP); restored backups are checked the same way.
- Photos are scaled to at most 2000 px and stored as JPEG; images with transparency are stored as PNG.
- Previews and downloads always go through the authenticated API; files are never served statically. Only images, PDF, and plain text open as a preview; other files are downloaded.

## First-run setup

Until the first account exists, the start page offers to create it to anyone who can reach Boberit. Complete the setup immediately after the first start, and only then publish the port to other networks or the internet.

## Sign-in protection

After 5 failed sign-ins for one login from one address, further attempts for that login are refused for 15 minutes. Other logins are never affected. Behind a reverse proxy all clients share the proxy's address, so the limit then applies to the login regardless of where the attempts come from. Counters reset when the container restarts.

## Webhooks

Webhooks are sent only to public addresses, without following redirects, with a 10-second timeout. The address is checked when a webhook is saved and again on every delivery. To reach a service in your local network, set `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true`. Webhook secrets are encrypted with `APP_ENC_KEY`; if the key changes, affected webhooks are skipped and the delivery list asks you to save the secret again.

## OCR

Tesseract runs locally inside the container for Polish and English. It reads images, PDFs with a text layer, and scanned PDFs up to 12 pages. No external OCR service is used.

## Container and HTTPS

The image runs as an unprivileged user and reports its health to Docker through `/api/v1/health`. The example `compose.yaml` drops all Linux capabilities, blocks privilege escalation, and limits memory (2 GB), CPU (2 cores), and processes (256); raise the limits if large OCR jobs or backup restores run out of memory.

Boberit sends browser security headers, including a Content Security Policy, and serves the app and API from one origin without cross-origin access. When you publish it over HTTPS through a reverse proxy, set `Strict-Transport-Security` there; the app does not send it because it may run on plain HTTP in a local network.

## Backup and restore

**Settings → Backup** exports the active household with its data and attachments. Only a household owner can export, restore, or permanently empty the trash, and export and restore ask for the owner's current password. Restore replaces the household's data only after explicit confirmation. It validates the whole package first and gives every restored record and attachment a new identifier; if anything fails, the household keeps its current data and files. Webhook configuration and secrets are excluded from backups.

Download a backup before every upgrade. Never run `docker compose down -v` if you want to keep your data: it deletes the volume.
