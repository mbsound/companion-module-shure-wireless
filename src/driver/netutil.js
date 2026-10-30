// Small network helpers: which local interface reaches a unit, and address lists.

import os from 'node:os';

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIpv4(text) {
  const m = IPV4.exec(String(text ?? '').trim());
  return !!m && m.slice(1).every((part) => Number(part) <= 255);
}

const toInt = (ip) => ip.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);

/** `"10.0.0.5, 10.0.0.6"` into the valid addresses in it. */
export function parseAddressList(text) {
  if (typeof text !== 'string') return [];
  return text
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(isIpv4);
}

/** Every non-loopback IPv4 interface of this computer. */
export function localInterfaces() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal)
        out.push({ name, address: addr.address, netmask: addr.netmask });
    }
  }
  return out;
}

export const localAddresses = () => localInterfaces().map((i) => i.address);

/**
 * The local interface that reaches `host`: the one whose subnet holds it, else
 * (a unit on a link-local or unrouted address) the first interface on the same
 * kind of network, else the first interface there is.
 */
export function localInterfaceFor(host) {
  const interfaces = localInterfaces();
  if (host === '127.0.0.1') return { name: 'lo0', address: '127.0.0.1', netmask: '255.0.0.0' };
  const target = toInt(host);
  const onSubnet = interfaces.find((i) => {
    const mask = toInt(i.netmask);
    return (toInt(i.address) & mask) === (target & mask);
  });
  if (onSubnet) return onSubnet;
  const linkLocal = host.startsWith('169.254.');
  return (
    interfaces.find((i) => i.address.startsWith('169.254.') === linkLocal) ?? interfaces[0] ?? null
  );
}
