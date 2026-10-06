# Local resource limits

This project is developed inside a 6 GiB Incus container shared with editors and
other applications. An unbounded local Trivy scan contributed to an OOM incident.

- Use `npm run image:build -- <tag>` for local Docker builds and
  `npm run image:scan -- <local-image>` for local Trivy scans.
- Do not run unbounded `docker build`, `docker compose build`, `docker compose up
  --build`, or direct Trivy scans on this development machine. Use the bounded
  scripts or the existing GitHub Actions release workflow.
- The scripts serialize heavy work, reserve memory headroom, cap builder/scanner
  RAM and CPU, and stop the builder after use. Do not bypass or raise their limits
  merely because a task fails; report the resource failure or use CI instead.
- Do not start multiple heavy tasks concurrently. For any additional local test
  container, set explicit memory, memory-swap and CPU limits.
- Local scan/build failures must never be represented as successful verification.

See `docs/GITHUB_RELEASES.md` for commands and the scope of these safeguards.

# Release notes

Record new changes under `0.1.1 — Unreleased` in `CHANGELOG.md`, preserving the
existing `0.1.0` release history.
