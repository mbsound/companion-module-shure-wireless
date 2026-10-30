// A stand-in AD4Q that speaks the real wire on loopback: it advertises over
// SLP, completes the JOIN in both directions, waits for the controller to
// declare DMP protocol 2, and then answers GET, SET (with its commit PDU) and
// SUBSCRIBE from a property store modelled on what a real unit holds. It is
// what the tests, the smoke check and the in-app simulator run against.
//
// It behaves like the unit where that matters to the driver: a SET without the
// commit PDU is applied and never answered, an out-of-range SET answers
// SET_FAIL with reason 5, and an unknown address answers GET_FAIL.

import { randomBytes } from 'node:crypto';
import dgram from 'node:dgram';
import {
  COMMIT_PDU,
  DMP,
  SDT,
  buildJoin,
  buildJoinAccept,
  buildWrapper,
  clientBlock,
  dmpPdu,
  mgmtAck,
  parseDmp,
  parseWrapper,
  pduEncode,
  buildLeaving,
  rootParse,
  sdtMessages,
  strBatch,
} from '../acn/pdu.js';
import { buildAttrRply } from '../acn/slp.js';
import { FakeCommandServer } from './fake-commands.js';
import { ANTENNAS, SCAN_LIMITS, SCAN_OBJ, SCAN_STATUS, configKeys, dataKey, statusKeys } from '../ad4q/scan.js';
import {
  CH,
  DEV,
  ROSTER_SLOTS,
  TX_MODEL_BY_GUID,
  chanAddr,
  channelsFor,
  encodeString,
  rosterAddrs,
  rosterIdAddr,
  SYNC_PRESETS,
  KEY,} from '../ad4q/properties.js';

const u8 = (n) => Buffer.from([n & 0xff]);
const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};
const i16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeInt16BE(n);
  return b;
};
const i32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};

const FAIL_OUT_OF_RANGE = 5;
// what an AD4D sends after a committed SET, as captured: GET_FAIL, no address, code 1
const NO_ADDRESS_REPLY = Buffer.from([0x70, 0x06, DMP.GET_FAIL, 0x00, 0x00, 0x01]);

export class FakeAd4q {
  /**
   * `model` is `AD4Q` (four channels) or `AD4D` (two). A real AD4Q echoes a
   * committed SET as an event; a real AD4D answers it with a reply that names no
   * address, so `echoSets` defaults to what each does.
   *
   * `scan` is what the unit reports of its own RF scan (`originKhz`, `startKhz`, `stopKhz`,
   * `stepKhz`; a band A unit by default) and `scanChunkMs` how fast it streams the samples.
   */
  constructor({
    uacn,
    host = '127.0.0.1',
    slpPort = 0,
    model = 'AD4Q',
    echoSets = model !== 'AD4D',
    scan = {},
    scanQuirks = {},
    scanChunkMs = 1,
    restartMs = 400,
    channels = null,
  } = {}) {
    this.model = model;
    /** an ANX4 fake advertises its Axient Digital module and has the channels it is "licensed" for (16 by default) */
    this.anx4 = model === 'ANX4';
    this.echoSets = echoSets;
    this.scanGeometry = { originKhz: 470_000, startKhz: 470_125, stopKhz: 607_875, stepKhz: 25, ...scan };
    // ways a unit this fake has not met might behave: samples under another curve index, or none at all
    this.scanQuirks = { curveOffset: 0, silent: false, ...scanQuirks };
    this.scanChunkMs = scanChunkMs;
    /** how long the unit is off the network after a change that restarts it (HD mode) */
    this.restartMs = restartMs;
    this.restarting = false;
    /** how many times the unit has restarted, for tests */
    this.restarts = 0;
    // `poisoned`: a real unit ignores every later scan in a session once a scan key is unsubscribed
    this.scanState = { claimed: false, poisoned: false, config: new Map(), subscriptions: new Set(), status: SCAN_STATUS.IDLE, timer: null, owner: null };
    /** every scan the unit has run, `{ channel, antenna, startKhz, stopKhz }`, for tests */
    this.scans = [];
    this.channels = channels ?? (this.anx4 ? 16 : channelsFor(model));
    /** an ANX4's string-keyed values: the licence and each channel's antenna pair (all AB) */
    this.anxKeys = new Map();
    if (this.anx4) {
      this.anxKeys.set(KEY.LICENSED_CHANNELS, u16(this.channels));
      this.anxKeys.set(KEY.TRANSMISSION_MODE, u8(2)); // Axient Digital Standard
      for (let c = 1; c <= this.channels; c += 1) this.anxKeys.set(KEY.antennaSelection(c), u8(0));
    }
    this.host = host;
    this.uacn = uacn ?? `${model} (simulated)`;
    this.slpTarget = slpPort;
    this.cid = Buffer.concat([randomBytes(4), Buffer.from('000011dda000000eddcccccc', 'hex')]);
    this.devChan = 0x4200;
    this.socket = null;
    this.adverts = null;
    /** the command-strings (TCP 2202) side of the unit, started with `listen()` */
    this.commands = new FakeCommandServer({ channels: this.channels, model: this.anx4 ? model : `${model}-A`, host });
    /** every controller in a session with the unit, by `ip:port`: { cid, chan, rinfo, totalSeq, relSeq, firstRel, declared, subscribed } */
    this.controllers = new Map();
    this.timers = [];
    /** every SET received, `{ addr, value, committed }`, for tests */
    this.writes = [];
    /** how many controllers have JOINed */
    this.joins = 0;
    this.store = new Map();
    this.#seed();
  }

  get controlPort() {
    return this.socket?.address().port;
  }

  get commandPort() {
    return this.commands.port;
  }

  get slpPort() {
    return this.slpTarget;
  }

  // --- the property store --------------------------------------------------------

  #seed() {
    const put = (addr, value, check) => this.store.set(addr, { value, check });
    const inSet = (...allowed) => (v) => allowed.includes(v[0]);
    const range = (lo, hi) => (v) => {
      const n = v.length === 1 ? v.readInt8(0) : v.length === 2 ? v.readUInt16BE(0) : v.readUInt32BE(0);
      return n >= lo && n <= hi;
    };
    put(DEV.MODEL, encodeString(this.anx4 ? this.model : `${this.model}-A`));
    put(DEV.SERIAL, encodeString('SIM000001'));
    put(DEV.NAME, encodeString(this.uacn.slice(0, 31)), (v) => v.length >= 2);
    put(DEV.POWER_LOCK, u8(0), inSet(0, 1));
    put(DEV.FAN_ALWAYS_ON, u8(0), inSet(0, 1));
    put(DEV.PANEL_LOCK, u8(0), inSet(0, 1));
    if (!this.anx4) put(DEV.BAND, encodeString('G57'), (v) => ['G53', 'G54', 'G55', 'G56', 'G57', 'G57+', 'G62', 'G63', 'H54'].includes(v.subarray(2).toString('ascii')));
    put(DEV.HD_MODE, u8(0), inSet(0, 1));
    if (!this.anx4) {
      put(DEV.QUADVERSITY, u8(0));
      put(DEV.ANTENNA_BIAS, u8(0), inSet(0, 1));
    } else {
      // the ANX4 as read 2026-10-28: four named antennas, no unit band, no scan range
      put(DEV.ANTENNA_A, encodeString('Antenna A'));
      put(DEV.ANTENNA_B, encodeString('Antenna B'));
      put(DEV.ANTENNA_C, encodeString('Antenna C'));
      put(DEV.ANTENNA_D, encodeString('Antenna D'));
    }
    const g = this.scanGeometry;
    if (!this.anx4) {
      put(SCAN_LIMITS.START, u32(g.startKhz));
      put(SCAN_LIMITS.STOP, u32(g.stopKhz));
    }
    put(SCAN_LIMITS.ORIGIN, u32(g.originKhz));
    put(SCAN_LIMITS.STEP, u32(g.stepKhz));
    for (let c = 1; c <= this.channels; c += 1) {
      const at = (obj) => chanAddr(c, obj);
      put(at(CH.NAME), encodeString(this.anx4 ? `Ch.${String(c).padStart(2, '0')}` : `Channel${c}`), (v) => v.length >= 2 && v.readUInt16BE(0) <= 10);
      if (this.anx4) {
        put(at(CH.BAND), encodeString('G57+'));
        // the sync presets as a fresh unit reads them: every row "No change"
        for (const p of Object.values(SYNC_PRESETS)) put(at(p.obj), u8(0xff), (v) => v.length === 1);
      }
      put(at(CH.GAIN_DB), u8(0), range(-18, 42));
      put(at(CH.MUTE), u8(0), inSet(0, 1));
      put(at(CH.OVERLOAD_HOLD), u8(0), inSet(0, 1));
      put(at(CH.TONE_ACTIVE), u8(0));
      put(at(CH.TONE_FREQ_HZ), u16(400), range(20, 20_000));
      put(at(CH.TONE_LEVEL_DB), u8(0x80), (v) => v[0] === 0x80 || (v.readInt8(0) >= -60 && v.readInt8(0) <= -12));
      put(at(CH.FREQ_KHZ), u32(470_000 + c * 25_000), (v) => {
        const khz = v.readUInt32BE(0);
        return khz >= 470_000 && khz <= 1_000_000 && khz % 25 === 0;
      });
      put(at(CH.DIVERSITY), u8(2), inSet(0, 2, 4));
      put(at(CH.INTERFERENCE_AVOIDANCE), u8(1), inSet(0, 1, 2));
      put(at(CH.UNREGISTERED_TX), u8(1), inSet(0, 1, 2));
      put(at(CH.RF_POWER), u8(1), inSet(0, 1, 2, 0xff));
      put(at(CH.TALK_ROUTING), u8(0));
      // no transmitter paired: the sentinel values the unit reports until an IR sync
      put(at(CH.TX_MODEL), encodeString(''));
      put(at(CH.TX_SERIAL), u32(0xffffffff));
      put(at(CH.TX_BATTERY), u8(0xff));
      for (const addr of rosterAddrs(c)) put(addr, Buffer.alloc(16), (v) => v.length === 16);
      put(at(CH.ENCRYPTION), u8(0), inSet(0, 3));
      put(at(CH.RF_LEVEL_A), i16(-900));
      put(at(CH.RF_LEVEL_B), i16(-920));
      put(at(CH.AUDIO_LEVEL), i32(-115));
      put(at(SCAN_OBJ.CLAIM), u8(0));
      if (!this.anx4) {
        put(at(SCAN_OBJ.START), u8(0));
        put(at(SCAN_OBJ.RELEASE), u8(0));
      }
    }
  }

  /**
   * IR-sync a transmitter into a channel, as the unit reports it: the status bank
   * fills in, and the roster slot flashes the identity and type before clearing.
   */
  syncTransmitter(channel, slot, { model = 'ADX2', serial = '0048ba2e', battery = 100 } = {}) {
    const guid = Object.entries(TX_MODEL_BY_GUID).find(([, m]) => m === model)?.[0];
    if (!guid || slot < 1 || slot > ROSTER_SLOTS) throw new RangeError('unknown model or slot');
    this.setLocal(chanAddr(channel, CH.TX_MODEL), encodeString(model));
    this.setLocal(chanAddr(channel, CH.TX_SERIAL), Buffer.from(serial, 'hex'));
    this.setLocal(chanAddr(channel, CH.TX_BATTERY), u8(battery));
    const id = Buffer.concat([u8(0xff), Buffer.from(serial.slice(2), 'hex'), Buffer.from('000011dda000000eddcccccc', 'hex')]);
    const idAddr = rosterIdAddr(channel, slot);
    const guidAddr = idAddr + 0x10;
    this.setLocal(idAddr, id);
    this.setLocal(guidAddr, Buffer.from(guid.replaceAll('-', ''), 'hex'));
    const timer = setTimeout(() => {
      this.setLocal(idAddr, Buffer.alloc(16));
      this.setLocal(guidAddr, Buffer.alloc(16));
    }, 200);
    timer.unref?.();
    this.timers.push(timer);
  }

  /** The transmitter leaves: the status bank goes back to its sentinels. */
  removeTransmitter(channel) {
    this.setLocal(chanAddr(channel, CH.TX_MODEL), encodeString(''));
    this.setLocal(chanAddr(channel, CH.TX_SERIAL), u32(0xffffffff));
    this.setLocal(chanAddr(channel, CH.TX_BATTERY), u8(0xff));
  }

  /** Change a value as the unit itself would, pushing an EVENT to subscribers. */
  setLocal(addr, value) {
    const entry = this.store.get(addr);
    if (!entry) return;
    entry.value = value;
    this.#pushEvent(addr);
  }

  // --- lifecycle -------------------------------------------------------------------

  async listen() {
    const socket = dgram.createSocket('udp4');
    this.socket = socket;
    socket.on('message', (data, rinfo) => this.#onDatagram(data, rinfo));
    await new Promise((resolve) => socket.bind({ port: 0, address: this.host }, resolve));
    await this.commands.listen();
    if (this.slpTarget) this.#startAdverts();
    // a slow movement on the RF meters, and an audio level that the tone generator lifts
    const level = setInterval(() => {
      const base = -900 + Math.round(Math.sin(Date.now() / 800) * 200);
      for (let c = 1; c <= this.channels; c += 1) {
        this.setLocal(chanAddr(c, CH.RF_LEVEL_A), i16(base - c * 10));
        this.setLocal(chanAddr(c, CH.RF_LEVEL_B), i16(base - 20 - c * 10));
        const toneOn = this.store.get(chanAddr(c, CH.TONE_ACTIVE))?.value[0] === 1;
        this.setLocal(chanAddr(c, CH.AUDIO_LEVEL), i32(toneOn ? -18 : -115));
      }
    }, 100);
    level.unref?.();
    this.timers.push(level);
  }

  #startAdverts() {
    this.adverts = dgram.createSocket('udp4');
    const send = () =>
      this.restarting ||
      this.adverts?.send(
        buildAttrRply({
          cid: this.cid,
          fctn: this.anx4 ? 'MCR_AD' : `${this.model}_RX`,
          uacn: this.uacn,
          ip: this.host,
          port: this.controlPort,
        }),
        this.slpTarget,
        this.host,
        () => {}
      );
    send();
    const timer = setInterval(send, 400);
    timer.unref?.();
    this.timers.push(timer);
  }

  async stop() {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    this.adverts?.close();
    this.adverts = null;
    await new Promise((resolve) => (this.socket ? this.socket.close(resolve) : resolve()));
    this.socket = null;
    await this.commands.stop();
  }

  // --- the wire --------------------------------------------------------------------

  #sendTo(ctl, packet) {
    if (ctl) this.socket?.send(packet, ctl.rinfo.port, ctl.rinfo.address);
  }

  /** `true` while at least one controller has declared DMP. */
  get declared() {
    return [...this.controllers.values()].some((c) => c.declared);
  }

  /** The controllers that have declared DMP and subscribed to `addr` or `key`. */
  #subscribers(addrOrKey) {
    return [...this.controllers.values()].filter((c) => c.declared && c.subscribed.has(addrOrKey));
  }

  #onDatagram(data, rinfo) {
    if (this.restarting) return; // off the network
    const root = rootParse(data);
    if (!root) return;
    for (const { vector, data: body } of sdtMessages(root.sdt)) {
      if (vector === SDT.JOIN) this.#onJoin(root.cid, body, rinfo);
      else if (vector === SDT.REL_WRAP || vector === SDT.UNREL_WRAP)
        this.#onWrapper(this.controllers.get(`${rinfo.address}:${rinfo.port}`), vector === SDT.REL_WRAP, body);
    }
  }

  /** A controller joins: its own session, beside any other controller's, as on a real unit. */
  #onJoin(controllerCid, body, rinfo) {
    const chan = body.readUInt16BE(18);
    const relSeq = body.readUInt32BE(26) & 0xffff;
    const ctl = { cid: controllerCid, chan, rinfo, totalSeq: 1, relSeq: this.devChan, firstRel: null, declared: false, subscribed: new Set() };
    this.controllers.set(`${rinfo.address}:${rinfo.port}`, ctl);
    this.joins += 1;
    this.#sendTo(ctl, buildJoinAccept(this.cid, controllerCid, chan, relSeq, this.devChan));
    // the reciprocal JOIN back to the controller
    this.#sendTo(ctl, buildJoin(this.cid, controllerCid, this.devChan));
  }

  #onWrapper(ctl, reliable, body) {
    const wrapper = parseWrapper(body);
    if (!wrapper || !ctl) return;
    for (const { payload } of wrapper.blocks) {
      if (payload.length >= 7 && payload[0] === 0x70 && payload[2] === 0x09 && payload.readUInt32BE(3) === 2) {
        ctl.declared = true;
        this.#reliable(ctl, clientBlock(1, 1, 0, pduEncode(0x0a, null, u32(2))));
      } else if (ctl.declared && payload.length >= 6) {
        this.#onDmp(ctl, payload);
      }
    }
    if (reliable) {
      this.#unreliable(ctl, clientBlock(1, 1, ctl.chan, mgmtAck(wrapper.rel & 0xffff)));
    }
  }

  #reliable(ctl, ...blocks) {
    ctl.relSeq = (ctl.relSeq + 1) & 0xffff;
    ctl.firstRel ??= ctl.relSeq;
    const total = ctl.totalSeq;
    ctl.totalSeq = (ctl.totalSeq + 1) & 0xffff;
    this.#sendTo(ctl, buildWrapper(this.cid, this.devChan, total, ctl.relSeq, ctl.firstRel, blocks, true));
  }

  #unreliable(ctl, ...blocks) {
    const total = ctl.totalSeq;
    ctl.totalSeq = (ctl.totalSeq + 1) & 0xffff;
    this.#sendTo(ctl, buildWrapper(this.cid, this.devChan, total, ctl.relSeq, ctl.relSeq, blocks, false));
  }

  #dmp(ctl, ...pdus) {
    this.#reliable(ctl, clientBlock(1, 2, 0, Buffer.concat(pdus)));
  }

  #onDmp(ctl, payload) {
    const committed = payload.length >= COMMIT_PDU.length && payload.subarray(-COMMIT_PDU.length).equals(COMMIT_PDU);
    const replies = [];
    for (const { vector, addr, key, value } of parseDmp(payload)) {
      if (key !== undefined) {
        replies.push(...this.#onScanString(ctl, vector, key, value));
        continue;
      }
      if (addr === null) continue; // the commit PDU and the like name no address
      const entry = this.store.get(addr);
      if (vector === DMP.GET) {
        if (this.#isChannelObj(addr, SCAN_OBJ.CLAIM)) {
          // a running scan keeps its session; a claim from anyone else does not take the channel over
          const st = this.scanState;
          if (!st.timer || st.owner === ctl) {
            st.claimed = true;
            st.owner = ctl;
          }
        }
        replies.push(entry ? dmpPdu(DMP.GET_REPLY, addr, entry.value) : dmpPdu(DMP.GET_FAIL, addr, u8(2)));
      } else if (vector === DMP.SUBSCRIBE) {
        if (entry) ctl.subscribed.add(addr);
        replies.push(dmpPdu(entry ? DMP.SUB_ACCEPT : DMP.SUB_REJECT, addr, entry ? Buffer.alloc(0) : u8(2)));
      } else if (vector === DMP.SET) {
        this.writes.push({ addr, value: Buffer.from(value), committed });
        if (!entry || (entry.check && !entry.check(value))) {
          if (committed) replies.push(dmpPdu(DMP.SET_FAIL, addr, u8(FAIL_OUT_OF_RANGE)));
          continue;
        }
        entry.value = Buffer.from(value);
        // a bare SET takes effect and is never answered
        if (committed) {
          replies.push(this.echoSets ? dmpPdu(DMP.EVENT, addr, entry.value) : NO_ADDRESS_REPLY);
        }
        this.#afterWrite(addr);
      }
    }
    // each reply travels in its own wrapper, as the unit's do, back to the controller that asked
    for (const pdu of replies) this.#dmp(ctl, pdu);
  }

  #afterWrite(addr) {
    for (let c = 1; c <= this.channels; c += 1) {
      if (addr === chanAddr(c, CH.ENCRYPTION)) {
        // one setting for the unit: every channel follows, and each is pushed
        for (let o = 1; o <= this.channels; o += 1) if (o !== c) this.setLocal(chanAddr(o, CH.ENCRYPTION), this.store.get(addr).value);
      }
    }
    if (addr === DEV.BAND) {
      // what each band scans, as read from an AD4D-A; a band not listed keeps the current limits
      const band = this.store.get(DEV.BAND).value.subarray(2).toString('ascii');
      const span = { G53: [470_125, 509_875], G57: [470_125, 607_875], 'G57+': [470_125, 607_875], G62: [510_100, 529_900], H54: [520_125, 636_000] }[band];
      if (span) {
        this.scanGeometry.startKhz = span[0];
        this.scanGeometry.stopKhz = span[1];
        this.setLocal(SCAN_LIMITS.START, u32(span[0]));
        this.setLocal(SCAN_LIMITS.STOP, u32(span[1]));
      }
    }
    if (addr === DEV.HD_MODE) this.#restart();
    for (let c = 1; c <= this.channels; c += 1) {
      if (addr === chanAddr(c, SCAN_OBJ.START)) this.#startScan(c);
      else if (addr === chanAddr(c, SCAN_OBJ.RELEASE)) this.#stopScan();
    }
    // setting a tone level lights the tone indicator for a moment
    for (let c = 1; c <= this.channels; c += 1) {
      if (addr === chanAddr(c, CH.TONE_LEVEL_DB)) {
        this.setLocal(chanAddr(c, CH.TONE_ACTIVE), u8(1));
        const timer = setTimeout(() => this.setLocal(chanAddr(c, CH.TONE_ACTIVE), u8(0)), 300);
        timer.unref?.();
      }
    }
  }


  // --- the RF scan -------------------------------------------------------------------

  #isChannelObj(addr, obj) {
    for (let c = 1; c <= this.channels; c += 1) if (addr === chanAddr(c, obj)) return true;
    return false;
  }

  #resetScan() {
    this.#stopScan({ quiet: true });
    this.scanState.claimed = false;
    this.scanState.poisoned = false;
    this.scanState.config.clear();
    this.scanState.subscriptions.clear();
  }

  /** A string-keyed message: the scan's configuration, status and samples. Returns the PDUs to answer with. */
  #onScanString(ctl, vector, key, value) {
    const state = this.scanState;
    const reply = (v, val = Buffer.alloc(0)) => strBatch(v, [{ key, value: val }]);
    // the ANX4's own string-keyed settings: the licence and the antenna pair per channel
    if (this.anx4 && this.anxKeys.has(key)) {
      if (vector === DMP.GET) return [reply(DMP.GET_REPLY, this.anxKeys.get(key))];
      if (vector === DMP.SET && /ANTENNA_SELECTION_MODE/.test(key)) {
        if (value.length !== 1 || value[0] > 1) return [reply(DMP.SET_FAIL, u8(5))];
        // the unit applies it a moment later, as Workbench sees
        setTimeout(() => this.anxKeys.set(key, Buffer.from(value)), 100);
        return [];
      }
    }
    if (vector === DMP.SUBSCRIBE) {
      ctl.subscribed.add(key);
      return [];
    }
    if (vector === DMP.UNSUBSCRIBE) {
      ctl.subscribed.delete(key);
      if (/RF_SCAN/.test(key)) state.poisoned = true;
      return [];
    }
    if (vector === DMP.GET) {
      if (key.includes('CURRENT_STATUS')) return [reply(DMP.GET_REPLY, u8(state.status))];
      if (key.includes('CURRENT_SWEEP_STATUS')) return [reply(DMP.GET_REPLY, u8(0))];
      if (key.includes('CURRENT_SWEEP_ID')) return [reply(DMP.GET_REPLY, u32(0))];
      return [reply(DMP.GET_FAIL, u8(2))];
    }
    if (vector === DMP.SET) {
      const known = Object.values(configKeys(0)).some((k) => key.replace(/CH=\d+/, 'CH=0') === k);
      if (!known) return [];
      // without the claim, or while another session's scan runs, the unit refuses the configuration with reason 1
      if (!state.claimed || (state.timer && state.owner !== ctl)) return [reply(DMP.SET_FAIL, u8(1))];
      state.config.set(key.replace(/\/CH=\d+/, ''), Buffer.from(value));
    }
    return [];
  }

  /** A string-keyed event, to the controller running the scan. */
  #pushScan(key, value) {
    const owner = this.scanState.owner;
    if (!owner || !owner.declared || !this.controllers.has(`${owner.rinfo.address}:${owner.rinfo.port}`)) return;
    this.#dmp(owner, strBatch(DMP.EVENT, [{ key, value }]));
  }

  #setScanStatus(ch, status) {
    this.scanState.status = status;
    this.#pushScan(statusKeys(ch).status, u8(status));
  }

  /** The level the unit reports at a frequency: a noise floor, and a strong signal that antenna A hears better than B. */
  scanLevelDbm(khz, antenna) {
    const mhz = khz / 1000;
    const peak = (centre, level, width) => level - ((mhz - centre) / width) ** 2 * 12;
    const noise = (((Math.round(khz / 25) * 2654435761) >>> 0) % 1000) / 1000;
    const signals = antenna === 'A' ? [peak(507, -78, 0.3), peak(530.325, -92, 0.3)] : [peak(507, -90, 0.3), peak(530.325, -80, 0.3)];
    return Math.max(-105 + noise * 2, ...signals);
  }

  #startScan(channel) {
    const state = this.scanState;
    const cfg = state.config;
    const want = configKeys(0);
    const get = (name) => cfg.get(want[name].replace(/\/CH=\d+/, ''));
    if (!state.claimed || state.poisoned || state.timer || !get('start') || !get('stop') || !get('curve')) return;
    // the claim is spent by the scan: the next one needs its own
    state.claimed = false;
    const startKhz = get('start').readUInt32BE(0);
    const stopKhz = get('stop').readUInt32BE(0);
    const stepKhz = get('step')?.readUInt32BE(0) || this.scanGeometry.stepKhz;
    const select = get('curve').readUInt32BE(0);
    const antenna = Object.keys(ANTENNAS).find((a) => ANTENNAS[a].select === select);
    if (!antenna) return;
    const ch = channel - 1;
    const lo = Math.round((startKhz - this.scanGeometry.originKhz) / stepKhz);
    const hi = Math.round((stopKhz - this.scanGeometry.originKhz) / stepKhz);
    this.scans.push({ channel, antenna, startKhz, stopKhz });
    state.channel = ch;
    this.#setScanStatus(ch, SCAN_STATUS.ACTIVE);
    this.#pushScan(statusKeys(ch).sweepId, u32(0));
    this.#pushScan(statusKeys(ch).progress, u8(0));
    let next = lo;
    let lastPercent = 0;
    state.timer = setInterval(() => {
      if (next > hi) {
        this.#finishScan(ch);
        return;
      }
      if (this.scanQuirks.silent) return; // started, and then nothing
      const end = Math.min(next + 15, hi);
      const count = end - next + 1;
      const body = Buffer.alloc(7 + count * 2);
      body.writeUInt16BE(body.length, 0);
      body.writeUInt32BE(count, 2);
      body[6] = 2;
      for (let i = 0; i < count; i += 1) {
        const khz = this.scanGeometry.originKhz + (next + i) * stepKhz;
        body.writeInt16BE(Math.round(this.scanLevelDbm(khz, antenna) * 10), 7 + i * 2);
      }
      this.#pushScan(dataKey(ch, ANTENNAS[antenna].curve + this.scanQuirks.curveOffset, next, end), body);
      next = end + 1;
      const percent = Math.floor(((next - lo) / (hi - lo + 1)) * 20) * 5;
      if (percent > lastPercent) {
        lastPercent = percent;
        this.#pushScan(statusKeys(ch).progress, u8(Math.min(percent, 100)));
      }
    }, this.scanChunkMs);
    state.timer.unref?.();
    this.timers.push(state.timer);
  }

  #finishScan(ch) {
    clearInterval(this.scanState.timer);
    this.scanState.timer = null;
    this.#pushScan(statusKeys(ch).progress, u8(100));
    this.#setScanStatus(ch, SCAN_STATUS.FINISHING);
    this.#setScanStatus(ch, SCAN_STATUS.IDLE);
  }

  /** The release: ends a scan in progress, and the unit reports idle. */
  #stopScan({ quiet = false } = {}) {
    const state = this.scanState;
    const running = !!state.timer;
    clearInterval(state.timer);
    state.timer = null;
    state.status = SCAN_STATUS.IDLE;
    // the unit reports idle on the channel that was scanning, not on channel 1
    if (running && !quiet) this.#pushScan(statusKeys(state.channel ?? 0).status, u8(SCAN_STATUS.IDLE));
  }

  /** The unit restarts: it says goodbye, drops off the network for a while, then takes a fresh join with its settings kept. */
  #restart() {
    const t = setTimeout(() => {
      for (const ctl of this.controllers.values()) this.#sendTo(ctl, buildLeaving(this.cid, ctl.cid, this.devChan));
      this.restarting = true;
      this.restarts += 1;
      this.controllers.clear();
      this.#resetScan();
      const back = setTimeout(() => {
        this.restarting = false;
      }, this.restartMs);
      back.unref?.();
      this.timers.push(back);
    }, 150);
    t.unref?.();
    this.timers.push(t);
  }

  #pushEvent(addr) {
    for (const ctl of this.#subscribers(addr)) this.#dmp(ctl, dmpPdu(DMP.EVENT, addr, this.store.get(addr).value));
  }
}
