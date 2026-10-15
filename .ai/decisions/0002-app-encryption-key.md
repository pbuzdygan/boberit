# ADR-0002: Mandatory APP_ENC_KEY for secrets and session tokens

- Status: accepted
- Date: 2026-10-14 (records a decision implemented in 0.1.0)
- Deciders: project owner
- Related work: [docs/CONFIGURATION.md](../../docs/CONFIGURATION.md)
- Supersedes: none

## Context

Webhooks may carry secrets that must not be stored in plaintext or leak through backups. Session tokens must not be stored in a usable form.

## Decision

- `APP_ENC_KEY` (32 bytes as 64 hex characters) is mandatory and has no default; Compose refuses to start without it.
- Webhook secrets are encrypted with AES-256-GCM using a random 12-byte IV per value.
- Session tokens are stored only as HMAC-SHA-256 digests keyed with `APP_ENC_KEY`.
- Webhook configuration and secrets are excluded from household backups; the key is supplied only through the environment or the ignored `.env` file.

## Consequences

### Positive

- A leaked database or backup does not reveal webhook secrets or usable session tokens.

### Negative or trade-offs

- Losing or changing the key makes stored webhook secrets undecryptable and invalidates all sessions; there is no key rotation mechanism yet.
- Operators must back up the key separately.

## Alternatives considered

- Deriving the key from a password or storing it in the data volume: the key would sit next to the data it protects.

## Security, migration, and rollback

- Security effect: described above.
- Migration: changing the key requires re-saving webhooks with secrets.
- Rollback: restoring the previous key restores decryption.

## Verification

Compose fails without the key; webhook secrets in the database are not plaintext; sessions stop working after a key change.
