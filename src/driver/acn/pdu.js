// ACN (ANSI E1.17) packet codec: the root layer, SDT messages and DMP PDUs.
// Pure functions over Buffers, no I/O.

export const ROOT_PREAMBLE = Buffer.concat([
  Buffer.from([0x00, 0x10, 0x00, 0x00]),
  Buffer.from('ASC-E1.17', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00]),
]);
const ROOT_VECTOR_SDT = 1;

export const SDT = Object.freeze({
  REL_WRAP: 1,
  UNREL_WRAP: 2,
  JOIN: 4,
  JOIN_REFUSE: 5,
  JOIN_ACCEPT: 6,
  LEAVING: 7,
  NAK: 8,
});

export const DMP = Object.freeze({
  GET: 1,
  SET: 2,
  GET_REPLY: 3,
  EVENT: 4,
  SUBSCRIBE: 7,
  UNSUBSCRIBE: 8,
  GET_FAIL: 9,
  SET_FAIL: 10,
  SUB_ACCEPT: 12,
  SUB_REJECT: 13,
});

// DMP header byte for a single absolute four-byte address.
const ADDR_HEADER = 0x02;
// DMP header byte for a PDU that carries no address, as the commit PDU does.
const NO_ADDR_HEADER = 0x00;
// DMP header byte for a PDU addressed by a string key, as the RF scan's are.
export const STRING_HEADER = 0x07;

// Appended to every SET so the device answers it (see Ad4qDevice.set).
export const COMMIT_PDU = Buffer.from([0x70, 0x05, 0x01, 0x00, 0x00]);

const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n & 0xffff, 0);
  return b;
};
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
};

/** One PDU with every field present (flags V|H|D, 12-bit length). */
export function pduEncode(vector, header, data, vectorSize = 1) {
  const parts = [];
  if (vector != null) {
    const v = Buffer.alloc(vectorSize);
    v.writeUIntBE(vector, 0, vectorSize);
    parts.push(v);
  }
  if (header) parts.push(header);
  if (data) parts.push(data);
  const body = Buffer.concat(parts);
  const total = 2 + body.length;
  if (total > 0x0fff) throw new RangeError('PDU too long for a 12-bit length');
  return Buffer.concat([Buffer.from([0x70 | (total >> 8), total & 0xff]), body]);
}

/** `{ flags, dataStart, end }` of the PDU at `offset`, or null if it does not fit. */
export function pduDecode(buf, offset) {
  if (offset + 2 > buf.length) return null;
  const flags = buf[offset] >> 4;
  let length;
  let dataStart;
  if (flags & 0x8) {
    if (offset + 3 > buf.length) return null;
    length = ((buf[offset] & 0x0f) << 16) | (buf[offset + 1] << 8) | buf[offset + 2];
    dataStart = offset + 3;
  } else {
    length = ((buf[offset] & 0x0f) << 8) | buf[offset + 1];
    dataStart = offset + 2;
  }
  if (length < dataStart - offset || offset + length > buf.length) return null;
  return { flags, dataStart, end: offset + length };
}

export function rootWrap(srcCid, sdtPdu) {
  const inner = Buffer.concat([u32(ROOT_VECTOR_SDT), srcCid, sdtPdu]);
  const total = 2 + inner.length;
  return Buffer.concat([
    ROOT_PREAMBLE,
    Buffer.from([0x70 | (total >> 8), total & 0xff]),
    inner,
  ]);
}

/** `{ cid, sdt }` of a root-layer datagram, or null for anything else. */
export function rootParse(packet) {
  if (packet.length < 18 || packet.toString('ascii', 4, 13) !== 'ASC-E1.17') return null;
  const pdu = pduDecode(packet, 16);
  if (!pdu) return null;
  const at = pdu.dataStart;
  return {
    cid: packet.subarray(at + 4, at + 20),
    sdt: packet.subarray(at + 20, pdu.end),
  };
}

/** The vector and data of each SDT PDU in a root layer's payload. */
export function* sdtMessages(sdt) {
  let offset = 0;
  while (offset < sdt.length) {
    const pdu = pduDecode(sdt, offset);
    if (!pdu) return;
    yield { vector: sdt[pdu.dataStart], data: sdt.subarray(pdu.dataStart + 1, pdu.end) };
    offset = pdu.end;
  }
}

// parameters the controller proposes for the channel it opens
const JOIN_PARAMS = Buffer.from([0x00, 0x05, 0x00, 0x00, 0x02, 0x00, 0x32, 0x00, 0x14, 0xff]);

/** Open a channel to a device: our reliable sequence base equals the channel. */
export function buildJoin(srcCid, deviceCid, chan, mid = 1) {
  const seq = chan & 0xffff;
  const data = Buffer.concat([
    deviceCid,
    u16(mid),
    u16(chan),
    Buffer.alloc(2),
    u32(seq),
    u32(seq),
    JOIN_PARAMS,
  ]);
  return rootWrap(srcCid, pduEncode(SDT.JOIN, null, data));
}

/** Accept the device's reciprocal JOIN. */
export function buildJoinAccept(srcCid, leaderCid, leaderChan, relSeq, ourChan, mid = 1) {
  const data = Buffer.concat([
    leaderCid,
    u16(leaderChan),
    u16(mid),
    Buffer.alloc(2),
    u16(relSeq),
    u16(ourChan),
  ]);
  return rootWrap(srcCid, pduEncode(SDT.JOIN_ACCEPT, null, data));
}

/** The unit's notice that it is ending the session (a reboot, for one). The driver reads only the vector. */
export function buildLeaving(srcCid, leaderCid, leaderChan, mid = 1, reason = 1) {
  const data = Buffer.concat([leaderCid, u16(leaderChan), u16(mid), u32(0), Buffer.from([reason])]);
  return rootWrap(srcCid, pduEncode(SDT.LEAVING, null, data));
}

/** A client block: a payload for one association, tagged with its protocol. */
export function clientBlock(mid, proto, assoc, payload) {
  const body = Buffer.concat([u16(mid), u32(proto), u16(assoc), payload]);
  const total = 2 + body.length;
  return Buffer.concat([Buffer.from([0x70 | (total >> 8), total & 0xff]), body]);
}

const WRAP_TRAILER_DEFAULT = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00, 0x00]);
export const WRAP_TRAILER_FIRST = Buffer.from([0xff, 0xff, 0x00, 0x00, 0x00, 0x00]);
/** Sent on an unreliable wrapper to ask the receiver to acknowledge what it has received. */
export const WRAP_TRAILER_ACK_REQUEST = Buffer.from([0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);

/** An SDT wrapper carrying client blocks, reliable or not. */
export function buildWrapper(
  srcCid,
  chan,
  total,
  rel,
  oldest,
  blocks,
  reliable = true,
  trailer = WRAP_TRAILER_DEFAULT
) {
  const header = Buffer.concat([u16(chan), u32(total), u32(rel), u32(oldest), trailer]);
  return rootWrap(
    srcCid,
    pduEncode(reliable ? SDT.REL_WRAP : SDT.UNREL_WRAP, null, Buffer.concat([header, ...blocks]))
  );
}

/** Management ack: tells the device the last reliable sequence we have seen. */
export const mgmtAck = (seq) => pduEncode(0x0e, null, u32(seq));

/** `{ chan, total, rel, oldest, blocks: [{ proto, payload }] }` of an SDT wrapper's data. */
export function parseWrapper(data) {
  if (data.length < 20) return null;
  const chan = data.readUInt16BE(0);
  const total = data.readUInt32BE(2);
  const rel = data.readUInt32BE(6);
  const oldest = data.readUInt32BE(10);
  const body = data.subarray(20);
  const blocks = [];
  let offset = 0;
  while (offset < body.length) {
    const pdu = pduDecode(body, offset);
    if (!pdu) break;
    const content = body.subarray(pdu.dataStart, pdu.end);
    let at = pdu.flags & 0x4 ? 2 : 0;
    let proto = null;
    if (pdu.flags & 0x2) {
      if (content.length >= at + 6) proto = content.readUInt32BE(at);
      at += 6;
    }
    blocks.push({ proto, payload: content.subarray(at) });
    offset = pdu.end;
  }
  return { chan, total, rel, oldest, blocks };
}

/** One DMP PDU: vector, a four-byte absolute address, and a raw value. */
export function dmpPdu(vector, addr, value = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from([vector, ADDR_HEADER]), u32(addr), value]);
  const total = 2 + body.length;
  if (total <= 0x0fff) return Buffer.concat([Buffer.from([0x70 | (total >> 8), total & 0xff]), body]);
  const long = 3 + body.length;
  return Buffer.concat([
    Buffer.from([0xf0 | (long >> 16), (long >> 8) & 0xff, long & 0xff]),
    body,
  ]);
}

/**
 * One vector over several addresses: the first PDU carries the vector and
 * header, each further address is a continuation PDU that inherits them.
 */
export function dmpBatch(vector, addrs) {
  const first = Buffer.concat([Buffer.from([0x70, 0x08, vector, ADDR_HEADER]), u32(addrs[0])]);
  const rest = addrs.slice(1).map((addr) => Buffer.concat([Buffer.from([0x10, 0x06]), u32(addr)]));
  return Buffer.concat([first, ...rest]);
}

/**
 * One vector over several string-keyed properties (the RF scan's): the first
 * PDU carries the vector and header, each further key is a continuation PDU
 * that inherits them. A key is a two-byte length that counts itself, then ASCII.
 */
export function strBatch(vector, entries) {
  return Buffer.concat(
    entries.map(({ key, value = Buffer.alloc(0) }, i) => {
      const name = Buffer.from(key, 'latin1');
      const data = Buffer.concat([u16(2 + name.length), name, value]);
      const total = (i === 0 ? 4 : 2) + data.length;
      if (total > 0x0fff) throw new RangeError('PDU too long for a 12-bit length');
      const lead = [(i === 0 ? 0x70 : 0x10) | (total >> 8), total & 0xff];
      return Buffer.concat([Buffer.from(i === 0 ? [...lead, vector, STRING_HEADER] : lead), data]);
    })
  );
}

/**
 * Every `{ vector, addr, value }` in a DMP payload. A PDU that carries a
 * vector and header sets both for the continuation PDUs after it, which carry
 * only an address (or key) and a value. A string-keyed PDU has `addr: null` and
 * a `key`; a reply that names neither has `addr: null` and no `key`.
 */
export function parseDmp(payload) {
  const out = [];
  let vector = null;
  let header = null;
  let offset = 0;
  const stringEntry = (at, end) => {
    if (end - at < 2) return null;
    const keyLength = payload.readUInt16BE(at);
    if (keyLength < 2 || at + keyLength > end) return null;
    return {
      vector,
      addr: null,
      key: payload.toString('latin1', at + 2, at + keyLength),
      value: payload.subarray(at + keyLength, end),
    };
  };
  while (offset + 1 < payload.length) {
    const lead = payload[offset] & 0xf0;
    if (lead !== 0x70 && lead !== 0x10) break;
    const length = ((payload[offset] & 0x0f) << 8) | payload[offset + 1];
    if (length < 2 || offset + length > payload.length) break;
    const end = offset + length;
    if (lead === 0x70) {
      if (length >= 4) {
        vector = payload[offset + 2];
        header = payload[offset + 3];
        if (header === ADDR_HEADER && length >= 8) {
          out.push({ vector, addr: payload.readUInt32BE(offset + 4), value: payload.subarray(offset + 8, end) });
        } else if (header === NO_ADDR_HEADER && length >= 6) {
          // a reply that names no address: an AD4D answers a committed SET this way
          out.push({ vector, addr: null, value: payload.subarray(offset + 4, end) });
        } else if (header === STRING_HEADER && length >= 6) {
          const entry = stringEntry(offset + 4, end);
          if (entry) out.push(entry);
        }
      }
    } else if (header === STRING_HEADER) {
      const entry = stringEntry(offset + 2, end);
      if (entry) out.push(entry);
    } else if (length >= 6) {
      out.push({ vector, addr: payload.readUInt32BE(offset + 2), value: payload.subarray(offset + 6, end) });
    }
    offset += length;
  }
  return out;
}
