// Shure's documented command-strings protocol (TCP 2202, ASCII `< GET x PROP >` / `< REP x PROP value >`),
// used beside the ACN session for what that session cannot see: the transmitter being received, the
// registered transmitter slots and their ShowLink state, and the channel status flags. The unit
// reports a change to any non-metered property on its own, so after the first read nothing is polled.

import { EventEmitter } from 'node:events';
import net from 'node:net';

export const COMMAND_PORT = 2202;
const REQUEST_TIMEOUT_MS = 3000;

/** `< REP 1 TX_MODEL ADX2 >` -> { channel: 1, prop: 'TX_MODEL', args: ['ADX2'] }; `< REP MODEL {AD4D-A   } >` -> channel null. */
export function parseReport(frame) {
  const m = /^<\s*REP\s+(.*?)\s*>$/s.exec(frame);
  if (!m) return parseSample(frame);
  const tokens = [];
  const re = /\{([^}]*)\}|(\S+)/g;
  let t;
  while ((t = re.exec(m[1]))) tokens.push(t[1] !== undefined ? { braced: t[1] } : t[2]);
  if (!tokens.length) return null;
  if (tokens[0] === 'ERR') return { channel: null, prop: 'ERR', args: [] };
  let channel = null;
  if (typeof tokens[0] === 'string' && /^\d{1,2}$/.test(tokens[0])) channel = Number(tokens.shift());
  const prop = tokens.shift();
  if (typeof prop !== 'string') return null;
  const args = tokens.map((x) => (typeof x === 'string' ? x : x.braced.trimEnd()));
  return { channel, prop, args };
}

/**
 * `< SAMPLE 1 ALL 005 031 102 102 BB 31 086 31 065 >`: the metered values of a channel, sent at the
 * METER_RATE. Only the channel quality (0..5, 255 unknown) is kept; levels come from the ACN session.
 */
export function parseSample(frame) {
  // the channel is one or two digits: an ANX4 meters channels 10-24 too
  const m = /^<\s*SAMPLE\s+(\d{1,2})\s+ALL\s+(\d{3})\s+\d{3}\s+\d{3}\s+\d{3}\s+([XRB]{2,4})\b/.exec(frame);
  if (!m) return null;
  const qual = Number(m[2]);
  return {
    channel: Number(m[1]),
    prop: 'SAMPLE',
    args: [],
    sample: { quality: qual === 255 ? null : qual, antennas: [...m[3]].map((c) => (c === 'X' ? null : c === 'B')) },
    // [companion] the whole sample, for the audio and RF bitmaps the button icons draw
    line: frame.replace(/^<\s*/, '').replace(/\s*>$/, ''),
  };
}

/** The frames in a stream buffer; returns the frames and what is left over. */
export function splitFrames(text) {
  const frames = [];
  let rest = text;
  for (;;) {
    const start = rest.indexOf('<');
    if (start < 0) return { frames, rest: '' };
    const end = rest.indexOf('>', start);
    if (end < 0) return { frames, rest: rest.slice(start) };
    frames.push(rest.slice(start, end + 1));
    rest = rest.slice(end + 1);
  }
}

export class CommandClient extends EventEmitter {
  constructor({ host, port = COMMAND_PORT, log = () => {} }) {
    super();
    this.host = host;
    this.port = port;
    this.log = log;
    this.socket = null;
    this.buffer = '';
    this.pending = []; // { match(rep), resolve, reject, timer, collect?: [] }
    this.closed = false;
  }

  get connected() {
    return !!this.socket && !this.socket.destroyed && !this.closed;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const fail = (err) => {
        socket.destroy();
        reject(err);
      };
      socket.setNoDelay(true);
      socket.once('connect', () => {
        socket.off('error', fail);
        socket.on('error', (err) => this.#lost(err));
        socket.on('close', () => this.#lost(new Error('the command connection closed')));
        socket.on('data', (d) => this.#onData(d.toString('latin1')));
        this.socket = socket;
        resolve();
      });
      socket.once('error', fail);
      const timer = setTimeout(() => fail(new Error(`no command connection to ${this.host}:${this.port} in ${REQUEST_TIMEOUT_MS} ms`)), REQUEST_TIMEOUT_MS);
      timer.unref?.();
      socket.once('connect', () => clearTimeout(timer));
    });
  }

  #lost(err) {
    if (this.closed) return;
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
    for (const p of this.pending.splice(0)) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.emit('lost', err);
  }

  #onData(text) {
    this.buffer += text;
    const { frames, rest } = splitFrames(this.buffer);
    this.buffer = rest;
    for (const frame of frames) {
      const rep = parseReport(frame);
      if (!rep) continue;
      const i = this.pending.findIndex((p) => p.match(rep));
      if (i >= 0) {
        const p = this.pending[i];
        if (p.collect) {
          p.collect.push(rep);
          if (p.collect.length < p.count) continue;
          this.pending.splice(i, 1);
          clearTimeout(p.timer);
          p.resolve(p.collect);
        } else {
          this.pending.splice(i, 1);
          clearTimeout(p.timer);
          p.resolve(rep);
        }
      }
      this.emit('rep', rep);
    }
  }

  #send(line) {
    if (!this.connected) throw new Error('the command connection is not open');
    this.socket.write(line);
  }

  /** Send a GET and wait for its reports: `count` of them when a GET answers with several (slot 0). */
  #request(line, match, count = 1) {
    if (!this.connected) return Promise.reject(new Error('the command connection is not open'));
    const answer = this.#await(match, count);
    this.#send(line);
    return answer;
  }

  /** Wait for reports matching `match`. */
  #await(match, count = 1) {
    return new Promise((resolve, reject) => {
      const p = { match, resolve, reject, timer: null, collect: count > 1 ? [] : null, count };
      p.timer = setTimeout(() => {
        const i = this.pending.indexOf(p);
        if (i >= 0) this.pending.splice(i, 1);
        reject(new Error('no report from the unit'));
      }, REQUEST_TIMEOUT_MS);
      p.timer.unref?.();
      this.pending.push(p);
    });
  }

  /** A device property: `get('MODEL')` -> 'AD4D-A'. */
  async get(prop) {
    const rep = await this.#request(`< GET ${prop} >`, (r) => r.channel === null && r.prop === prop);
    return rep.args[0] ?? null;
  }

  /** A channel property: `getChannel(1, 'TX_MODEL')` -> 'ADX2'. */
  async getChannel(channel, prop) {
    const rep = await this.#request(`< GET ${channel} ${prop} >`, (r) => r.channel === channel && r.prop === prop);
    return rep.args;
  }

  /**
   * [companion] Like `get`/`getChannel`, but a `< REP ERR >` resolves null at once instead of waiting out the
   * timeout: for properties a given model or firmware may not have. One request at a time.
   */
  async query(channel, prop, slot = null) {
    const at = channel == null ? '' : `${channel} `;
    const tail = slot == null ? '' : ` ${slot}`;
    const match = (r) =>
      r.prop === 'ERR' || (r.channel === channel && r.prop === prop && (slot == null || Number(r.args[0]) === Number(slot)));
    const rep = await this.#request(`< GET ${at}${prop}${tail} >`, match);
    return rep.prop === 'ERR' ? null : rep.args;
  }

  /** Flash the unit's display (`identify(null)`) or one channel's (`identify(2)`) until it stops by itself. */
  async identify(channel = null) {
    const match = (r) => r.channel === channel && r.prop === 'FLASH';
    const rep = await this.#request(channel == null ? '< SET FLASH ON >' : `< SET ${channel} FLASH ON >`, match);
    return rep.args[0] === 'ON';
  }

  /** Have the unit send a SAMPLE line for a channel every `ms` (100..65535), or none with 0. */
  async setMeterRate(channel, ms) {
    const rep = await this.#request(`< SET ${channel} METER_RATE ${String(ms).padStart(5, '0')} >`, (r) => r.channel === channel && r.prop === 'METER_RATE');
    return Number(rep.args[0]);
  }

  /**
   * [companion] A documented SET: `set(1, 'SLOT_RF_OUTPUT', ['2', 'RF_MUTE'])` sends `< SET 1 SLOT_RF_OUTPUT 2 RF_MUTE >`
   * and resolves with the unit's report for it (with slot 0, the first of the slots' reports). `channel` null
   * is a device property. A `< REP ERR >` rejects, so callers must send one request at a time.
   */
  async set(channel, prop, args = []) {
    const at = channel == null ? '' : `${channel} `;
    const slot = prop.startsWith('SLOT_') && args.length ? String(args[0]) : null;
    const match = (r) =>
      r.prop === 'ERR' ||
      (r.channel === channel && r.prop === prop && (slot === null || slot === '0' || r.args[0] === slot || Number(r.args[0]) === Number(slot)));
    const rep = await this.#request(`< SET ${at}${prop} ${args.join(' ')} >`.replace(/\s+>$/, ' >'), match);
    if (rep.prop === 'ERR') throw new Error(`the unit refused SET ${at}${prop} ${args.join(' ')}`);
    return rep.args;
  }

  /** Every slot's value of a slot property: `getSlots(1, 'SLOT_STATUS')` -> { 1: 'EMPTY', ... 8: 'LINKED.ACTIVE' }. */
  async getSlots(channel, prop, slots = 8) {
    const reps = await this.#request(`< GET ${channel} ${prop} 0 >`, (r) => r.channel === channel && r.prop === prop, slots);
    const out = {};
    for (const rep of reps) out[Number(rep.args[0])] = rep.args.slice(1).join(' ');
    return out;
  }

  async close() {
    this.closed = true;
    for (const p of this.pending.splice(0)) {
      clearTimeout(p.timer);
      p.reject(new Error('the command connection closed'));
    }
    const socket = this.socket;
    this.socket = null;
    await new Promise((resolve) => (socket ? socket.end(resolve) : resolve()));
    socket?.destroy();
  }
}

// --- the values, decoded as the reference describes them -------------------------------

const unknownNum = (v, unknown) => (v == null || Number(v) === unknown ? null : Number(v));

/** What the unit says about the transmitter it is receiving on a channel, from the TX_* reports. */
export function decodeTransmitter(values) {
  const model = values.TX_MODEL && values.TX_MODEL !== 'UNKNOWN' ? values.TX_MODEL : null;
  const deviceId = values.TX_DEVICE_ID?.trim() || null;
  const mins = unknownNum(values.TX_BATT_MINS, 65535);
  return {
    present: !!model,
    model,
    deviceId,
    batteryPercent: unknownNum(values.TX_BATT_CHARGE_PERCENT, 255),
    batteryBars: unknownNum(values.TX_BATT_BARS, 255),
    // 65533 and 65534 are warnings and "calculating", not times
    batteryMinutes: mins != null && mins <= 65532 ? mins : null,
    batteryType: values.TX_BATT_TYPE && values.TX_BATT_TYPE !== 'UNKN' ? values.TX_BATT_TYPE : null,
    powerMw: unknownNum(values.TX_POWER_LEVEL, 255),
    muteMode: values.TX_MUTE_MODE_STATUS && values.TX_MUTE_MODE_STATUS !== 'UNKNOWN' ? values.TX_MUTE_MODE_STATUS : null,
    talkSwitch: values.TX_TALK_SWITCH === 'ON' ? true : values.TX_TALK_SWITCH === 'OFF' ? false : null,
    lock: values.TX_LOCK && values.TX_LOCK !== 'UNKNOWN' ? values.TX_LOCK : null,
  };
}

/** The ShowLink picture of a channel from its slots: linked when any registered ADX is online. */
export function decodeShowLink(statusBySlot, showLinkBySlot) {
  const slots = Object.keys(statusBySlot).map(Number).sort((a, b) => a - b);
  const active = slots.filter((s) => statusBySlot[s] === 'LINKED.ACTIVE');
  const quality = active.map((s) => unknownNum(showLinkBySlot?.[s], 255)).filter((q) => q != null);
  return {
    linked: active.length > 0,
    activeSlots: active,
    quality: quality.length ? Math.max(...quality) : null,
    registered: slots.filter((s) => statusBySlot[s] !== 'EMPTY').length,
  };
}

/** The transmitter properties worth holding, in the order they are read. */
export const TX_PROPS = Object.freeze([
  'TX_MODEL', 'TX_DEVICE_ID', 'TX_BATT_CHARGE_PERCENT', 'TX_BATT_BARS', 'TX_BATT_MINS', 'TX_BATT_TYPE',
  'TX_POWER_LEVEL', 'TX_MUTE_MODE_STATUS', 'TX_TALK_SWITCH', 'TX_LOCK',
]);
/** The channel status flags, each OK/NONE or an error word. */
export const STATUS_PROPS = Object.freeze(['ENCRYPTION_STATUS', 'INTERFERENCE_STATUS', 'UNREGISTERED_TX_STATUS']);
