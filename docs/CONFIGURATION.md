# Configuration and data

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `APP_ENC_KEY` | yes | — | 64 hex characters (`openssl rand -hex 32`). Encrypts webhook secrets with AES-256-GCM and keys session token hashes. |
| `APP_PORT` | no | `3219` | Host port published by `compose.yaml`. The container listens on `3000`. |
| `TZ` | no | `UTC` | Server time zone as an IANA name, e.g. `Europe/Warsaw`. Sets the server's notion of "today" for date-only values (see below). |
| `PUID` / `PGID` | no | `1000` | User and group the container runs as; set them to the owner of a bind-mounted data directory. |

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

- Only allowed file types are accepted, up to 25 MB per file.
- Photos are scaled to at most 2000 px and stored as JPEG; images with transparency are stored as PNG.
- Previews and downloads always go through the authenticated API; files are never served statically.

## OCR

Tesseract runs locally inside the container for Polish and English. It reads images, PDFs with a text layer, and scanned PDFs up to 12 pages. No external OCR service is used.

## Backup and restore

**Settings → Backup** exports the active household with its data and attachments. Restore replaces the household's data only after explicit confirmation. Webhook configuration and secrets are excluded from backups.

Download a backup before every upgrade. Never run `docker compose down -v` if you want to keep your data: it deletes the volume.
