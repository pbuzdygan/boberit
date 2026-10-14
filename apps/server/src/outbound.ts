import { lookup as dnsLookup, promises as dns } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

// Webhooks may only reach public addresses. Loopback, link-local and cloud metadata endpoints are never
// reachable; private networks only when the operator sets WEBHOOK_ALLOW_PRIVATE_NETWORKS=true.
const alwaysBlocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  alwaysBlocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fe80::', 10],
  ['ff00::', 8],
  ['fd00:ec2::254', 128],
] as const)
  alwaysBlocked.addSubnet(network, prefix, 'ipv6');

const privateNetworks = new BlockList();
for (const [network, prefix] of [
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
] as const)
  privateNetworks.addSubnet(network, prefix, 'ipv4');
privateNetworks.addSubnet('fc00::', 7, 'ipv6');

const blockedMessage = 'Adres webhooka wskazuje na sieć lokalną lub zastrzeżoną.';
const deliveryTimeoutMs = 10_000;

// IPv4-mapped IPv6 addresses (::ffff:127.0.0.1 or ::ffff:7f00:1) are checked as the IPv4 address they carry.
function unmapped(address: string): string {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address)?.[1];
  if (dotted) return dotted;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return address;
  const high = parseInt(hex[1]!, 16);
  const low = parseInt(hex[2]!, 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

export function isBlockedAddress(address: string): boolean {
  const ip = unmapped(address);
  const family = isIP(ip) === 6 ? 'ipv6' : 'ipv4';
  if (alwaysBlocked.check(ip, family)) return true;
  return process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS !== 'true' && privateNetworks.check(ip, family);
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^\[(.*)\]$/, '$1');
}

/** Returns a public error message when the URL may not be used as a webhook target, otherwise null. */
export async function webhookUrlError(value: unknown): Promise<string | null> {
  if (typeof value !== 'string' || value.length > 2048) return 'Podaj adres HTTP(S) webhooka.';
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return 'Podaj adres HTTP(S) webhooka.';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Podaj adres HTTP(S) webhooka.';
  if (url.username || url.password) return 'Adres webhooka nie może zawierać loginu ani hasła.';
  const host = hostOf(url);
  if (isIP(host)) return isBlockedAddress(host) ? blockedMessage : null;
  try {
    const addresses = await dns.lookup(host, { all: true });
    return addresses.some((entry) => isBlockedAddress(entry.address)) ? blockedMessage : null;
  } catch {
    return 'Nie można odnaleźć serwera webhooka.';
  }
}

// Checks every address the connection would use, so a DNS answer that changes after the URL was saved
// (DNS rebinding) cannot redirect a delivery into the local network.
const publicLookup = ((hostname: string, options: object, callback: (...args: unknown[]) => void) => {
  dnsLookup(hostname, options, (error, address, family) => {
    if (error) return callback(error, address, family);
    const addresses = Array.isArray(address) ? address.map((entry) => entry.address) : [address];
    if (addresses.some(isBlockedAddress)) return callback(new Error(blockedMessage), address, family);
    callback(null, address, family);
  });
}) as unknown as LookupFunction;

/** Sends one webhook request and resolves with the HTTP status. Redirects are not followed. */
export function postWebhook(target: string, headers: Record<string, string>, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = new URL(target);
    const host = hostOf(url);
    // Literal IP addresses skip the lookup function, so they are checked here.
    if (isIP(host) && isBlockedAddress(host)) return reject(new Error(blockedMessage));
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
        lookup: publicLookup,
        signal: AbortSignal.timeout(deliveryTimeoutMs),
      },
      (response) => {
        // Only the status is recorded; the response body is never read.
        resolve(response.statusCode ?? 0);
        response.destroy();
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}
