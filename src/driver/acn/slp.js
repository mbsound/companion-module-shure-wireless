// Service Location Protocol (RFC 2608), as Shure's ACN devices use it.
//
// A device announces itself with an SLPv2 AttrRply sent to the multicast group
// 239.255.254.253:8427. Its attribute list carries the component id, the
// function tag (`AD4Q_RX`), the user-assigned name, and the address and port
// of its session endpoint. A controller asks for them with a SrvRqst, and
// advertises itself the same way before it opens a session.

import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { localAddresses } from '../netutil.js';

export const SLP_GROUP = '239.255.254.253';
export const SLP_PORT = 8427;
export const DEFAULT_DEVICE_PORT = 57383;

/** `(key=value),(key=value)` into `{ key: value }`, keys lowercased. */
export function parseAttributes(list) {
  const attrs = {};
  for (const [, key, value] of list.matchAll(/\(([^()=]+)=([^()]*)\)/g))
    attrs[key.trim().toLowerCase()] = value.trim();
  return attrs;
}

/**
 * An SLPv2 AttrRply datagram as the unit it describes, or null for anything
 * else.
 *
 * Header: version(1) function(1) length(3) flags(2) next-ext(3) xid(2)
 * lang-tag-length(2) lang-tag; then error(2) attr-list-length(2) attr-list.
 */
export function parseAttrRply(datagram) {
  if (datagram.length < 16 || datagram[0] !== 0x02 || datagram[1] !== 0x07) return null;
  let offset = 14 + datagram.readUInt16BE(12);
  if (offset + 4 > datagram.length) return null;
  if (datagram.readUInt16BE(offset) !== 0) return null;
  const length = datagram.readUInt16BE(offset + 2);
  offset += 4;
  const attrs = parseAttributes(datagram.subarray(offset, offset + length).toString('utf8'));
  const cidText = attrs.cid;
  if (!cidText) return null;
  const endpoint = /esta\.sdt\/(\d+\.\d+\.\d+\.\d+):(\d+)/.exec(attrs['csl-esta.dmp'] ?? '');
  if (!endpoint) return null;
  return {
    cid: cidText.replace(/[^0-9a-f]/gi, '').toLowerCase(),
    cidText: cidText.toUpperCase(),
    fctn: attrs['acn-fctn'] ?? '',
    uacn: attrs['acn-uacn'] ?? '',
    ip: endpoint[1],
    port: Number(endpoint[2]),
  };
}

/** The AttrRply a device sends to announce itself (the inverse of `parseAttrRply`). */
export function buildAttrRply({ cid, fctn, uacn, ip, port }) {
  const hex = cid.toString('hex');
  const cidText = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)]
    .join('-')
    .toUpperCase();
  const attrs =
    `(cid=${cidText}),(acn-fctn=${fctn}),(acn-uacn=${uacn}),(acn-services=esta.dmp),` +
    `(csl-esta.dmp=esta.sdt/${ip}:${port};esta.dmp/cd:CD293640-E139-11DF-9DC0-0015C5F3F612)`;
  const list = Buffer.from(attrs, 'ascii');
  const body = Buffer.concat([
    Buffer.from([0x00, 0x00]),
    Buffer.from([0x00, 0x00, 0x00]),
    Buffer.from([0x22, 0x3d]),
    Buffer.from([0x00, 0x02]),
    Buffer.from('en', 'ascii'),
    Buffer.from([0x00, 0x00]),
    Buffer.from([list.length >> 8, list.length & 0xff]),
    list,
    Buffer.from([0x00]),
  ]);
  const packet = Buffer.concat([Buffer.from([0x02, 0x07, 0, 0, 0]), body]);
  packet.writeUIntBE(packet.length, 2, 3);
  return packet;
}

/** A SrvRqst, to prompt a device to advertise now rather than on its own schedule. */
export function buildSrvRqst(xid = 0x1234, serviceType = 'service:esta.sdt') {
  const type = Buffer.from(serviceType, 'ascii');
  const lang = Buffer.from('en', 'ascii');
  const body = Buffer.concat([
    Buffer.alloc(2), // previous-responder list
    Buffer.from([type.length >> 8, type.length & 0xff]),
    type,
    Buffer.alloc(2), // scope list
    Buffer.alloc(2), // predicate
    Buffer.alloc(2), // SPI
  ]);
  const header = Buffer.concat([
    Buffer.from([0x02, 0x01, 0, 0, 0]),
    Buffer.from([0x20, 0x00]), // multicast
    Buffer.alloc(3),
    Buffer.from([xid >> 8, xid & 0xff]),
    Buffer.from([0x00, lang.length]),
    lang,
  ]);
  const packet = Buffer.concat([header, body]);
  packet.writeUIntBE(packet.length, 2, 3);
  return packet;
}

/** The advert a controller sends before it opens a session. */
export function buildControllerAdvert({ cid, ip, port, fctn, uacn }) {
  const hex = cid.toString('hex');
  const cidText = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)]
    .join('-')
    .toUpperCase();
  const attrs =
    `(cid=${cidText}),(acn-fctn=${fctn}),(acn-uacn=${uacn}),(acn-services=esta.dmp),` +
    `(csl-esta.dmp=esta.sdt/${ip}:${port};esta.dmp/cd:CCDA8E0A-E139-11DF-8C7A-0015C5F3F612),` +
    `(device-description=$:tftp://${ip}/$.ddl),` +
    '(csl-esta.dmp.values=version:1_interfaceId:1_extVersion:1)';
  const list = Buffer.from(attrs, 'ascii');
  const after = Buffer.concat([
    Buffer.from([0x00, 0x00]), // flags
    Buffer.from([0x00, 0x00, 0x00]), // next extension
    Buffer.from([0x22, 0x3d]), // xid
    Buffer.from([0x00, 0x02]),
    Buffer.from('en', 'ascii'),
    Buffer.from([0x00, 0x00]), // error code
    Buffer.from([list.length >> 8, list.length & 0xff]),
    list,
    Buffer.from([0x00]), // no authentication blocks
  ]);
  const head = Buffer.from([0x02, 0x07, 0, 0, 0]);
  const packet = Buffer.concat([head, after]);
  packet.writeUIntBE(packet.length, 2, 3);
  return packet;
}

/**
 * A controller's SLP presence for the length of one session: the advert goes
 * out three times, then again every few seconds, from the SLP port itself.
 */
export class ControllerAdvert {
  constructor({ advert, localIp, log = () => {} }) {
    this.advert = advert;
    this.localIp = localIp;
    this.log = log;
    this.socket = null;
    this.timer = null;
  }

  async start() {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;
    socket.on('error', (err) => this.log('warn', `SLP advert socket: ${err.message}`));
    await new Promise((resolve) => {
      socket.once('error', resolve);
      socket.bind({ port: SLP_PORT, address: '0.0.0.0' }, resolve);
    });
    try {
      socket.setMulticastTTL(4);
      socket.setMulticastInterface(this.localIp);
      socket.addMembership(SLP_GROUP, this.localIp);
    } catch (err) {
      this.log('warn', `SLP multicast setup: ${err.message}`);
    }
    for (let i = 0; i < 3; i += 1) {
      this.#send();
      await new Promise((r) => setTimeout(r, 120));
    }
    this.timer = setInterval(() => this.#send(), 4000);
    this.timer.unref?.();
  }

  #send() {
    try {
      this.socket?.send(this.advert, SLP_PORT, SLP_GROUP);
    } catch {
      // a failed advert is retried on the next tick
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.socket = null;
  }
}

/**
 * Listens for devices' adverts and remembers when each was last heard. Cheap
 * enough to leave running; `stop()` releases the socket.
 */
export class SlpBrowser extends EventEmitter {
  /**
   * @param {{
   *   targets?: string[], multicast?: boolean, port?: number,
   *   filter?: (unit: object) => boolean, listedMs?: number, solicitMs?: number,
   *   log?: (level: string, message: string) => void,
   * }} options
   */
  constructor({
    targets = [],
    multicast = true,
    port = SLP_PORT,
    filter = () => true,
    listedMs = 30_000,
    solicitMs = 5_000,
    log = () => {},
  } = {}) {
    super();
    this.targets = targets;
    this.multicast = multicast;
    this.port = port;
    this.filter = filter;
    this.listedMs = listedMs;
    this.solicitMs = solicitMs;
    this.log = log;
    this.units = new Map(); // ip -> unit
    this.socket = null;
    this.timer = null;
    this.starting = null;
  }

  setTargets(targets) {
    this.targets = targets;
  }

  start() {
    if (this.socket || this.starting) return this.starting;
    this.starting = this.#open().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  async #open() {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;
    socket.on('error', (err) => this.log('warn', `SLP browse: ${err.message}`));
    socket.on('message', (data, rinfo) => this.#heard(data, rinfo));
    const bound = await new Promise((resolve) => {
      socket.once('error', () => resolve(false));
      socket.bind({ port: this.port, address: '0.0.0.0' }, () => resolve(true));
    });
    if (!bound) {
      this.socket = null;
      try {
        socket.close();
      } catch {
        // never opened
      }
      return;
    }
    if (this.multicast) {
      for (const address of localAddresses()) {
        try {
          socket.addMembership(SLP_GROUP, address);
        } catch {
          // an interface that cannot do multicast is skipped
        }
      }
    }
    this.#solicit();
    this.timer = setInterval(() => this.#solicit(), this.solicitMs);
    this.timer.unref?.();
  }

  #solicit() {
    const socket = this.socket;
    if (!socket) return;
    const request = buildSrvRqst();
    for (const ip of this.targets) {
      try {
        socket.send(request, SLP_PORT, ip);
      } catch {
        // an unreachable target is retried next time
      }
    }
    if (!this.multicast) return;
    for (const address of localAddresses()) {
      try {
        socket.setMulticastInterface(address);
        socket.send(request, SLP_PORT, SLP_GROUP);
      } catch {
        // skip an interface that will not send
      }
    }
  }

  #heard(data, rinfo) {
    const unit = parseAttrRply(data);
    if (!unit || !this.filter(unit)) return;
    const known = this.units.get(unit.ip);
    this.units.set(unit.ip, { ...unit, lastSeen: Date.now() });
    if (!known) this.emit('found', unit);
    else if (known.cid !== unit.cid) this.emit('changed', unit);
    void rinfo;
  }

  /** Units heard from recently. */
  devices() {
    const now = Date.now();
    for (const [ip, unit] of this.units) {
      if (now - unit.lastSeen > this.listedMs) {
        this.units.delete(ip);
        this.emit('lost', unit);
      }
    }
    return [...this.units.values()];
  }

  /** The unit at `ip`, waiting up to `timeoutMs` for it to be heard. */
  async find(ip, timeoutMs) {
    await this.start();
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const unit = this.devices().find((u) => u.ip === ip);
      if (unit) return unit;
      if (Date.now() >= deadline) return null;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close();
    } catch {
      // already closed
    }
  }
}
