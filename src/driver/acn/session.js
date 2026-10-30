// One ACN session with one device: the SDT channel (JOIN in both directions,
// reliable and unreliable wrappers, acks, NAK retransmit, keepalives) and the
// controller-initiated DMP association on top of it.
//
// What is specific to this device family:
//
//   - The controller speaks first once the channel is up: it declares DMP
//     protocol 2 and the device accepts. Everything after that is plaintext.
//   - Every block the controller sends has association 0.
//   - A SET is followed, in the same block, by a fixed commit PDU, which is
//     what makes the device answer it.
//   - The device has a small receive buffer: reliable sends are paced and
//     limited to a few in flight, or it drops some and eventually the session.

import { randomBytes } from 'node:crypto';
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import {
  COMMIT_PDU,
  SDT,
  WRAP_TRAILER_ACK_REQUEST,
  WRAP_TRAILER_FIRST,
  buildJoin,
  buildJoinAccept,
  buildWrapper,
  clientBlock,
  mgmtAck,
  parseDmp,
  parseWrapper,
  pduEncode,
  rootParse,
  rootWrap,
  sdtMessages,
} from './pdu.js';
import { ControllerAdvert, buildControllerAdvert } from './slp.js';

export const DMP_PROTOCOL = 2;
const CID_TAIL = Buffer.from('000011dda000000eddcccccc', 'hex');
const KEEPALIVE_MS = 1400;

const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A controller component id for one session: never one the device has seen before. */
export const sessionCid = () => Buffer.concat([randomBytes(4), CID_TAIL]);

export const DEFAULT_TIMINGS = Object.freeze({
  /** after the advert, before the JOIN */
  advertGapMs: 3000,
  /** from the JOIN to the DMP association being accepted */
  connectTimeoutMs: 20_000,
  /** between reliable sends */
  sendGapMs: 25,
  /** reliable wrappers allowed unacknowledged at once */
  maxInFlight: 3,
  /** how long a send may wait for a place in the window before it is given up on */
  sendTimeoutMs: 5000,
});

export class AcnSession extends EventEmitter {
  /**
   * @param {{
   *   host: string, port: number, deviceCid: Buffer, localIp: string,
   *   advert?: boolean, fctn?: string, uacn?: string, cid?: Buffer,
   *   timings?: Partial<typeof DEFAULT_TIMINGS>,
   *   log?: (level: string, message: string) => void,
   * }} options
   */
  constructor({
    host,
    port,
    deviceCid,
    localIp,
    advert = true,
    fctn = 'WWB6',
    uacn = 'WWB 6X',
    cid = null,
    timings,
    log = () => {},
  }) {
    super();
    this.host = host;
    this.port = port;
    this.deviceCid = deviceCid;
    this.localIp = localIp;
    this.advertise = advert;
    this.fctn = fctn;
    this.uacn = uacn;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.log = log;
    // AD4Q_DEBUG=1 logs every datagram in both directions, for working out what a unit is doing
    this.debug = process.env.AD4Q_DEBUG === '1';

    this.cid = cid ?? sessionCid();
    this.ourChan = 0x8000 | (randomBytes(1)[0] << 4);
    this.devChan = null;
    this.totalSeq = (this.ourChan + 1) & 0xffff;
    this.relSeq = this.ourChan;
    this.firstRelSeq = null;
    this.firstRel = true;
    this.devRel = 0;
    this.unacked = new Map();
    this.acceptedUs = false;
    this.sentAccept = false;
    this.joined = false;
    this.ready = false;
    this.closed = false;
    this.socket = null;
    this.slp = null;
    this.keepalive = null;
    this.lastKeepalive = 0;
    this.queue = [];
    this.pumping = false;
    this.lastSentAt = 0;
  }

  /** Advertise, JOIN, associate. Resolves once DMP can flow. */
  async connect() {
    const socket = dgram.createSocket('udp4');
    this.socket = socket;
    socket.on('error', (err) => this.#fail(err));
    socket.on('message', (data, rinfo) => this.#onDatagram(data, rinfo));
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.bind({ port: 0, address: '0.0.0.0' }, resolve);
    });
    const srcPort = socket.address().port;

    if (this.advertise) {
      this.slp = new ControllerAdvert({
        advert: buildControllerAdvert({
          cid: this.cid,
          ip: this.localIp,
          port: srcPort,
          fctn: this.fctn,
          uacn: this.uacn,
        }),
        localIp: this.localIp,
        log: this.log,
      });
      await this.slp.start();
      await sleep(this.timings.advertGapMs);
    }
    if (this.closed) throw new Error('session closed before it opened');

    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`the unit did not complete the session in ${this.timings.connectTimeoutMs} ms`)),
        this.timings.connectTimeoutMs
      );
      timer.unref?.();
      const done = (fn) => (value) => {
        clearTimeout(timer);
        this.off('ready', onReady);
        this.off('refused', onRefused);
        this.off('close', onClose);
        fn(value);
      };
      const onReady = done(resolve);
      const onRefused = done((reason) => reject(new Error(`the unit refused the session (${reason})`)));
      const onClose = done(() => reject(new Error('the session closed while opening')));
      this.once('ready', onReady);
      this.once('refused', onRefused);
      this.once('close', onClose);
    });

    this.#sendRaw(buildJoin(this.cid, this.deviceCid, this.ourChan));
    await ready;

    this.keepalive = setInterval(() => {
      if (this.joined && Date.now() - this.lastKeepalive > KEEPALIVE_MS) this.#ackDevice();
    }, 200);
    this.keepalive.unref?.();
  }

  #sendRaw(packet) {
    if (this.debug) this.log('debug', `TX ${packet.length}B ${packet.toString('hex')}`);
    this.socket?.send(packet, this.port, this.host);
  }

  #fail(err) {
    if (this.closed) return;
    this.emit('error', err);
  }

  // --- sending ---------------------------------------------------------------

  #sendReliable(blocks) {
    const total = this.totalSeq;
    this.totalSeq = (this.totalSeq + 1) & 0xffff;
    this.relSeq = (this.relSeq + 1) & 0xffff;
    this.firstRelSeq ??= this.relSeq;
    const trailer = this.firstRel ? WRAP_TRAILER_FIRST : undefined;
    this.firstRel = false;
    this.unacked.set(this.relSeq, blocks);
    if (this.debug) this.log('debug', `SEND reliable seq=0x${this.relSeq.toString(16)} (${this.unacked.size} unacked)`);
    this.#sendRaw(
      buildWrapper(this.cid, this.ourChan, total, this.relSeq, this.firstRelSeq, blocks, true, trailer)
    );
  }

  #sendUnreliable(blocks, trailer) {
    const total = this.totalSeq;
    this.totalSeq = (this.totalSeq + 1) & 0xffff;
    this.#sendRaw(buildWrapper(this.cid, this.ourChan, total, this.relSeq, this.relSeq, blocks, false, trailer));
  }

  #ackDevice() {
    // while sends are unacknowledged, ask the unit to acknowledge them: it only does so on request
    const ask = this.unacked.size > 0 ? WRAP_TRAILER_ACK_REQUEST : undefined;
    this.#sendUnreliable([clientBlock(1, 1, this.devChan ?? 0, mgmtAck(this.devRel))], ask);
    this.lastKeepalive = Date.now();
  }

  /**
   * Send one DMP payload, paced. A SET gets the commit PDU appended. Resolves
   * when it has gone out, not when the device has answered.
   */
  send(pdu, { commit = false } = {}) {
    if (!this.ready) return Promise.reject(new Error('the session is not open'));
    const payload = commit ? Buffer.concat([pdu, COMMIT_PDU]) : pdu;
    return new Promise((resolve, reject) => {
      this.queue.push({ payload, resolve, reject, deadline: Date.now() + this.timings.sendTimeoutMs });
      void this.#pump();
    });
  }

  async #pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length && !this.closed) {
        const now = Date.now();
        // a unit that has stopped acknowledging never frees the window: give up rather than wait
        while (this.queue.length && this.queue[0].deadline <= now && this.unacked.size >= this.timings.maxInFlight) {
          this.queue.shift().reject(new Error('the unit is not acknowledging; the send was dropped'));
        }
        if (!this.queue.length) break;
        const wait = this.lastSentAt + this.timings.sendGapMs - now;
        if (this.unacked.size >= this.timings.maxInFlight || wait > 0) {
          await sleep(Math.max(wait, 5));
          continue;
        }
        const item = this.queue.shift();
        this.#sendReliable([clientBlock(1, DMP_PROTOCOL, 0, item.payload)]);
        this.lastSentAt = Date.now();
        item.resolve();
      }
    } finally {
      this.pumping = false;
      for (const item of this.queue.splice(0)) item.reject(new Error('the session closed'));
    }
  }

  // --- receiving -------------------------------------------------------------

  #onDatagram(data, rinfo) {
    if (this.debug) this.log('debug', `RX ${data.length}B from ${rinfo.address}:${rinfo.port} ${data.toString('hex')}`);
    if (this.closed || rinfo.address !== this.host) return;
    try {
      const root = rootParse(data);
      if (!root) return;
      for (const { vector, data: body } of sdtMessages(root.sdt)) this.#dispatch(vector, body);
      if (this.acceptedUs && this.sentAccept && this.devChan && !this.joined) this.#completeJoin();
    } catch (err) {
      // one malformed datagram must not end the session
      this.log('warn', `undecodable datagram (${data.length} bytes): ${err.message}`);
    }
  }

  #dispatch(vector, data) {
    if (vector === SDT.JOIN_ACCEPT) {
      this.acceptedUs = true;
      this.devChan = data.readUInt16BE(data.length - 2);
    } else if (vector === SDT.JOIN) {
      this.devChan = data.readUInt16BE(18);
      const relSeq = data.readUInt32BE(26) & 0xffff;
      this.devRel = relSeq;
      if (!this.sentAccept) {
        this.sentAccept = true;
        this.#sendRaw(buildJoinAccept(this.cid, this.deviceCid, this.devChan, relSeq, this.ourChan));
      }
    } else if (vector === SDT.REL_WRAP || vector === SDT.UNREL_WRAP) {
      this.#onWrapper(vector === SDT.REL_WRAP, data);
    } else if (vector === SDT.NAK) {
      if (data.length >= 24) this.#retransmit(data.readUInt16BE(22));
    } else if (vector === SDT.LEAVING) {
      this.emit('leaving');
    } else if (vector === SDT.JOIN_REFUSE) {
      this.emit('refused', data.length > 16 ? data[data.length - 1] : 'unknown');
    }
  }

  #onWrapper(reliable, data) {
    const wrapper = parseWrapper(data);
    if (!wrapper) return;
    if (reliable) this.devRel = wrapper.rel & 0xffff;
    for (const { proto, payload } of wrapper.blocks) {
      if (payload[0] === 0x70 && payload.length >= 7 && payload[2] === 0x0e) {
        this.#onOurAck(payload.readUInt16BE(payload.length - 2));
      }
      if (
        !this.ready &&
        payload.length >= 7 &&
        payload[0] === 0x70 &&
        payload[2] === 0x0a &&
        payload.readUInt32BE(3) === DMP_PROTOCOL
      ) {
        this.ready = true;
        this.emit('ready');
        continue;
      }
      if (proto === DMP_PROTOCOL) {
        for (const pdu of parseDmp(payload)) this.emit('dmp', pdu);
      }
    }
    if (reliable) this.#ackDevice();
  }

  #onOurAck(ackSeq) {
    if (this.debug) this.log('debug', `ACK 0x${ackSeq.toString(16)} while unacked=[${[...this.unacked.keys()].map((q) => q.toString(16)).join(',')}]`);
    for (const seq of [...this.unacked.keys()]) {
      if (((seq - ackSeq) & 0xffff) === 0 || ((ackSeq - seq) & 0xffff) < 0x8000) this.unacked.delete(seq);
    }
  }

  #retransmit(missed) {
    const seqs = [...this.unacked.keys()]
      .filter((seq) => ((seq - missed) & 0xffff) < 0x8000)
      .sort((a, b) => ((a - missed) & 0xffff) - ((b - missed) & 0xffff));
    for (const seq of seqs) {
      const total = this.totalSeq;
      this.totalSeq = (this.totalSeq + 1) & 0xffff;
      const oldest = this.firstRelSeq ?? seq;
      this.#sendRaw(buildWrapper(this.cid, this.ourChan, total, seq, oldest, this.unacked.get(seq), true));
    }
  }

  #completeJoin() {
    this.joined = true;
    this.#ackDevice();
    // the controller speaks first: declare DMP protocol 2
    this.#sendReliable([clientBlock(1, 1, 0, pduEncode(0x09, null, u32(DMP_PROTOCOL)))]);
  }

  // --- closing ---------------------------------------------------------------

  /** Leave the session cleanly. Idempotent, and never throws. */
  async close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.keepalive);
    this.keepalive = null;
    try {
      if (this.joined && this.devChan && this.socket) {
        // this device's own teardown sequence: disassociate, leave, then leave the root
        for (let i = 0; i < 2; i += 1) {
          this.#sendReliable([clientBlock(1, 1, 0, pduEncode(0x0c, null, u32(0x102)))]);
          this.#sendReliable([clientBlock(1, 1, 0, pduEncode(7, null, Buffer.alloc(0)))]);
          await sleep(50);
        }
        const leave = rootWrap(
          this.cid,
          pduEncode(8, null, Buffer.concat([this.deviceCid, Buffer.from('b2b000010001207a06', 'hex')]))
        );
        this.#sendRaw(leave);
        this.#sendRaw(leave);
        await sleep(20);
      }
    } catch (err) {
      this.log('warn', `leaving the session: ${err.message}`);
    }
    this.slp?.stop();
    this.slp = null;
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.socket = null;
    this.emit('close');
  }
}
