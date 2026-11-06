import { BlockList, isIP, isIPv4 } from 'node:net';
import type { FastifyRequest } from 'fastify';

/** Removes a zone id and unwraps IPv4-mapped IPv6, so one client has one spelling. */
function canonical(ip: string): string {
  const bare = ip.split('%', 1)[0]!;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
  return mapped ? mapped[1]! : bare;
}

function ipv6Groups(ip: string): string[] {
  const [head, tail] = ip.toLowerCase().split('::') as [string, string | undefined];
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const zeros = tail === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...Array.from({ length: zeros }, () => '0'), ...right].map((g) => g.replace(/^0+(?=.)/, ''));
}

/**
 * What one client is counted as. IPv6 goes by /64, because a single subscriber is handed a whole /64
 * and can pick a new address from it for every request.
 */
export function rateKey(ip: string): string {
  const bare = canonical(ip);
  if (isIP(bare) !== 6) return bare;
  return `${ipv6Groups(bare).slice(0, 4).join(':')}::/64`;
}

const NOT_PUBLIC = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16]] as const) {
  NOT_PUBLIC.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]] as const) {
  NOT_PUBLIC.addSubnet(net, bits, 'ipv6');
}

export type IpClass = 'public IPv4' | 'public IPv6' | 'private/proxy';

/** A word for the log, since the address itself never goes there. */
export function classifyIp(ip: string): IpClass {
  const bare = canonical(ip);
  const v4 = isIPv4(bare);
  if (NOT_PUBLIC.check(bare, v4 ? 'ipv4' : 'ipv6')) return 'private/proxy';
  return v4 ? 'public IPv4' : 'public IPv6';
}

export interface ResolvedClient {
  ip: string;
  source: 'header' | 'hops';
}

/**
 * The configured header wins when it holds one address. It is only safe behind a proxy that overwrites
 * it on every request (see apps/api/README.md). Otherwise, hop counting through Fastify's trustProxy.
 */
export function resolveClient(request: FastifyRequest, header: string | null): ResolvedClient {
  if (header) {
    const value = request.headers[header];
    if (typeof value === 'string' && isIP(canonical(value.trim())) !== 0) return { ip: value.trim(), source: 'header' };
  }
  return { ip: request.ip, source: 'hops' };
}

export const clientKey = (request: FastifyRequest, header: string | null) => rateKey(resolveClient(request, header).ip);
