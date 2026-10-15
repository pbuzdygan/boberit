import type { AppInformation, ReleaseChannel, UpdateStatus } from '@boberit/shared';

// These destinations are fixed: callers cannot supply repositories, URLs or registry credentials.
const repository = 'pbuzdygan/boberit';
const releasesUrl = `https://api.github.com/repos/${repository}/releases?per_page=100`;
const tokenUrl = `https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`;
const cacheMs = 60_000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The project's release tags are X.Y.Z (main) and devX.Y.Z (dev). */
export function releaseVersion(tag: string, channel: ReleaseChannel): number[] | null {
  const match = /^(dev)?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.exec(tag);
  if (!match || (channel === 'dev') !== Boolean(match[1])) return null;
  return match.slice(2).map(Number);
}

function compare(left: number[], right: number[]): number {
  for (let i = 0; i < 3; i++) {
    const difference = left[i]! - right[i]!;
    if (difference) return difference;
  }
  return 0;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('Remote service unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error('Remote response too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

type Options = { version?: string | undefined; channel?: string | undefined; fetch?: typeof fetch; now?: () => number };

/** One cache and one in-flight check per installation, shared by all signed-in users. */
export function createUpdateChecker(options: Options) {
  const channel = options.channel === 'main' || options.channel === 'dev' ? options.channel : null;
  const version = channel && options.version && releaseVersion(options.version, channel) ? options.version : null;
  const remote = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let lastAttempt = -Infinity;
  let pending: Promise<AppInformation> | null = null;
  let info: AppInformation = {
    version,
    channel,
    status: 'unchecked',
    checkedAt: null,
    latestVersion: null,
    releaseUrl: null,
  };

  async function run(): Promise<AppInformation> {
    const signal = AbortSignal.timeout(10_000);
    const request = (url: string, init?: RequestInit) =>
      remote(url, {
        ...init,
        redirect: 'error',
        signal,
        headers: { 'User-Agent': 'Boberit-update-check', ...init?.headers },
      });
    try {
      const releases = await readJson(
        await request(releasesUrl, { headers: { Accept: 'application/vnd.github+json' } }),
      );
      if (!Array.isArray(releases)) throw new Error('Invalid releases');
      const candidates = releases
        .flatMap((entry: unknown) => {
          if (
            !record(entry) ||
            entry.draft !== false ||
            entry.prerelease !== (channel === 'dev') ||
            typeof entry.tag_name !== 'string'
          )
            return [];
          const numbers = releaseVersion(entry.tag_name, channel!);
          return numbers ? [{ tag: entry.tag_name, numbers }] : [];
        })
        .sort((a, b) => compare(b.numbers, a.numbers));
      const latest = candidates[0];
      if (!latest) throw new Error('No release for this channel');
      const difference = compare(latest.numbers, releaseVersion(version!, channel!)!);
      let status: UpdateStatus = difference > 0 ? 'available' : difference < 0 ? 'ahead' : 'current';
      if (difference > 0) {
        const token = await readJson(await request(tokenUrl));
        if (
          !record(token) ||
          typeof token.token !== 'string' ||
          !/^[A-Za-z0-9._~+/-]+=*$/.test(token.token) ||
          token.token.length > 16_384
        )
          throw new Error('Invalid registry token');
        const manifest = await request(`https://ghcr.io/v2/${repository}/manifests/${latest.tag}`, {
          method: 'HEAD',
          headers: {
            Authorization: `Bearer ${token.token}`,
            Accept:
              'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json',
          },
        });
        if (manifest.status === 404) status = 'preparing';
        else if (!manifest.ok) throw new Error('Registry unavailable');
      }
      info = {
        version,
        channel,
        status,
        checkedAt: new Date(now()).toISOString(),
        latestVersion: latest.tag,
        releaseUrl: `https://github.com/${repository}/releases/tag/${latest.tag}`,
      };
    } catch {
      // Remote failures are expected; never report "current" or expose remote bodies/credentials.
      info = { ...info, status: 'error' };
    }
    return { ...info };
  }

  return {
    information: (): AppInformation => ({ ...info }),
    check(): Promise<AppInformation> {
      if (!version || !channel) return Promise.resolve({ ...info });
      if (pending) return pending;
      if (now() - lastAttempt < cacheMs) return Promise.resolve({ ...info });
      lastAttempt = now();
      pending = run().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}
