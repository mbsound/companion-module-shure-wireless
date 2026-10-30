// The AD4Q's DMP properties: addresses, value encodings, and the settings the
// plugin reads and writes.
//
// A channel property lives at 0x02 <CH> <OBJ>: CH is 0 to 3 for the four
// receiver channels. A device property lives at 0x01 <...>. Integers are
// big-endian, signed where the codec says so; a string is a two-byte
// big-endian length that counts itself, then ASCII.

import { SCAN_LIMITS } from './scan.js';

export const CHANNEL_COUNT = 4;
/** The most channels any of these receivers has: an ANX4 licensed to the full 24 of ULX-D. */
export const MAX_CHANNELS = 24;

/**
 * The receivers this driver speaks to, by the function tag they advertise (`AD4D_RX`, …). The
 * ANX4 advertises its receiver module (`MCR_AD` for Axient Digital) rather than the frame, and
 * has as many channels as it is licensed for (0–24; 16 at most for Axient Digital), so its
 * count is read from the unit (`countChannels`) rather than taken from the tag.
 */
export const MODELS = Object.freeze({
  AD4Q: { channels: 4 },
  AD4D: { channels: 2 },
  ANX4: { channels: MAX_CHANNELS, licensed: true },
});

/** `AD4D` for an `AD4D_RX` advert, `ANX4` for an `MCR_AD` one, or null for anything else. */
export function modelOf(fctn) {
  const s = String(fctn ?? '');
  const m = /^(ad4[qd])/i.exec(s);
  if (m) return m[1].toUpperCase();
  if (/^mcr/i.test(s)) return 'ANX4';
  return null;
}
/**
 * String-keyed properties (DMP address header 0x07), the way Workbench reads and writes the
 * ANX4's licence and antenna selection (decoded capture, 2026-10-28). Channels are zero-based
 * in the key.
 */
export const KEY = Object.freeze({
  LICENSED_CHANNELS: 'LICENSE:RF_CHANNEL_COUNT', // u16: 0x0010 = 16
  MAX_CHANNELS: 'RF:MAX_NUM_CHANNELS', // byte: 0x10 = 16 in an Axient Digital mode
  TRANSMISSION_MODE: 'RF:CURRENT_TRANSMISSION_MODE', // byte: TRANSMISSION_MODES index
  antennaSelection: (channel) => `RF_ANTENNA:ANTENNA_SELECTION_MODE/CH=${channel - 1}`, // byte: 00 AB, 01 CD
});
/**
 * The ANX4's transmission modes by the byte `RF:CURRENT_TRANSMISSION_MODE` reads, each switched
 * in Workbench and read back (2026-10-28). The unit advertises `MCR_ULXD` in the ULX-D modes and
 * `MCR_AD` in the Axient Digital ones, and restarts on a change; the channel count is the licence
 * in every mode (24 ULX-D channels need 24 licences).
 */
export const TRANSMISSION_MODES = Object.freeze(['ULX-D Standard', 'ULX-D High Density', 'Axient Digital Standard', 'Axient Digital High Density']);
export const transmissionModeLabel = (v) => (v && v.length === 1 ? (TRANSMISSION_MODES[v[0]] ?? `Mode ${v[0]}`) : null);

/**
 * Whether the ANX4's channel band object holds a band. In a ULX-D mode it was read holding the
 * antenna-pair string ("AB", 2026-10-28) instead; only that observed case is filtered, so no
 * band name of a shape not seen yet is hidden.
 */
export const isBandName = (s) => { const t = String(s ?? '').trim(); return t.length > 0 && !ANTENNA_SELECTIONS.includes(t.toUpperCase()); };

/** The ANX4's antenna pair per channel, by the byte the unit stores. */
export const ANTENNA_SELECTIONS = Object.freeze(['AB', 'CD']);

/** A model whose channel count is a licence, read from the unit. */
export const isLicensedModel = (model) => MODELS[String(model ?? '').toUpperCase()]?.licensed === true;

export const isReceiverAdvert = (unit) => modelOf(unit?.fctn) !== null;

/** How many channels a model has; an unrecognised one is assumed to be the largest. */
export const channelsFor = (model) => MODELS[String(model ?? '').toUpperCase()]?.channels ?? CHANNEL_COUNT;
const CHANNEL_CLASS = 0x02;

/** Per-channel objects. */
export const CH = Object.freeze({
  NAME: 0x0001,
  GAIN_DB: 0x0102,
  MUTE: 0x0104,
  AUDIO_LEVEL: 0x0114,
  RF_LEVEL_A: 0x0812,
  RF_LEVEL_B: 0x0813,
  TALK_ROUTING: 0x0123,
  OVERLOAD_HOLD: 0x0125,
  TONE_ACTIVE: 0x0126,
  TONE_FREQ_HZ: 0x0127,
  TONE_LEVEL_DB: 0x0128,
  FREQ_KHZ: 0x0804,
  DIVERSITY: 0x0860,
  INTERFERENCE_AVOIDANCE: 0x080c,
  UNREGISTERED_TX: 0x08b0,
  RF_POWER: 0x1212,
  ENCRYPTION: 0x2000,
  // the paired transmitter's status bank: sentinel values until one is IR-synced
  TX_SERIAL: 0x110e,
  TX_MODEL: 0x110f,
  TX_BATTERY: 0x1111,
  // ANX4: the channel's own band ("G57+"); an AD4Q/AD4D has one band for the unit and refuses this
  BAND: 0x08f3,
  // ANX4: the sync presets — what an IR sync sends to the transmitter. Mapped row by row from
  // Workbench's "Sync presets" panel (2026-10-28); ff is "No change" in every one
  SYNC_RF_POWER: 0x1512, // 00 Normal, 01 High (02 Low assumed from the ADTQ's order)
  SYNC_BP_PAD: 0x1513, // 00 Off
  SYNC_BP_OFFSET: 0x1517, // dB
  SYNC_HH_OFFSET: 0x1516, // dB
  SYNC_PLUGON_PHANTOM: 0x152a, // volts: 0x30 = +48 V
  SYNC_PLUGON_PAD: 0x152d, // dB, signed: 0x0c = +12
  SYNC_PLUGON_OFFSET: 0x152b, // dB
  SYNC_PLUGON_HPF: 0x152c, // Hz: 0xb4 = 180
  SYNC_POLARITY: 0x151b, // 00 Positive, 01 Negative
  SYNC_MUTE_MODE: 0x1519, // 01 On
  SYNC_LOCKS: 0x1510, // 02 Power, 04 Menu (a bitmask: 00 None, 06 All assumed)
  SYNC_BATTERY: 0x1514, // 03 NiMH; read 02 before any change
  SYNC_CUSTOM_GROUPS: 0x1515, // 00 unticked
});

/** The registered-transmitter roster: eight slots, each an identity and a model GUID. */
export const ROSTER_SLOTS = 8;
const ROSTER_ID_BASE = 0x08c0;
const ROSTER_GUID_BASE = 0x08d0;

/** Device-level addresses. */
export const DEV = Object.freeze({
  MODEL: 0x01000000,
  SERIAL: 0x01000002,
  NAME: 0x01000012,
  POWER_LOCK: 0x01000023,
  FAN_ALWAYS_ON: 0x01000025,
  UPTIME: 0x0100002b,
  BAND: 0x01070003,
  HD_MODE: 0x01070004,
  QUADVERSITY: 0x01070009,
  ANTENNA_BIAS: 0x01070405,
  PANEL_LOCK: 0x010c0010,
  // ANX4: its four antenna inputs, named; absent on an AD4Q/AD4D
  ANTENNA_A: 0x01070241,
  ANTENNA_B: 0x01070242,
  ANTENNA_C: 0x01070243,
  ANTENNA_D: 0x01070244,
});

export function chanAddr(channel, obj) {
  if (!Number.isInteger(channel) || channel < 1 || channel > MAX_CHANNELS)
    throw new RangeError(`channel must be 1..${MAX_CHANNELS} (got ${channel})`);
  return ((CHANNEL_CLASS << 24) | ((channel - 1) << 16) | obj) >>> 0;
}

/** `{ channel, obj }` for a channel-class address, or null. */
export function splitAddr(addr) {
  if (addr >>> 24 !== CHANNEL_CLASS) return null;
  const channel = ((addr >>> 16) & 0xff) + 1;
  if (channel < 1 || channel > MAX_CHANNELS) return null;
  return { channel, obj: addr & 0xffff };
}

// --- codecs --------------------------------------------------------------------

export function decodeString(value) {
  if (!value || value.length < 2 || value.readUInt16BE(0) !== value.length) return null;
  const body = value.subarray(2);
  for (const byte of body) if (byte < 0x20 || byte > 0x7e) return null;
  return body.toString('ascii');
}

export function encodeString(text) {
  const body = Buffer.from(String(text), 'ascii');
  const out = Buffer.alloc(2 + body.length);
  out.writeUInt16BE(out.length, 0);
  body.copy(out, 2);
  return out;
}

export const decodeUint = (value) =>
  value && value.length >= 1 && value.length <= 6 ? value.readUIntBE(0, value.length) : null;
export const decodeInt = (value) =>
  value && value.length >= 1 && value.length <= 6 ? value.readIntBE(0, value.length) : null;
export const decodeBool = (value) => (value && value.length === 1 ? value[0] === 1 : null);

export const encodeU8 = (n) => Buffer.from([n & 0xff]);
export const encodeBool = (on) => Buffer.from([on ? 1 : 0]);
export const encodeU16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n & 0xffff, 0);
  return b;
};
export const encodeU32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
};

// --- settings ranges -----------------------------------------------------------

export const GAIN_MIN_DB = -18;
export const GAIN_MAX_DB = 42;

export const TONE_FREQ_MIN_HZ = 20;
export const TONE_FREQ_MAX_HZ = 20_000;
/** The tone generator's level is a signed dB byte in 6 dB steps; this value turns it off. */
export const TONE_OFF_DB = -128;
export const TONE_LEVELS_DB = Object.freeze([-60, -54, -48, -42, -36, -30, -24, -18, -12]);

export const FREQ_RASTER_KHZ = 25;
export const FREQ_MIN_KHZ = 470_000;
export const FREQ_MAX_KHZ = 1_000_000;

export const CHANNEL_NAME_MAX = 8;
export const DEVICE_NAME_MAX = 31;

export const DIVERSITY_MODES = Object.freeze(['Off', 'Selection', 'Combining']);
const DIVERSITY_BY_RAW = Object.freeze({ 0: 'Off', 2: 'Selection', 4: 'Combining' });
const DIVERSITY_RAW = Object.freeze({ off: 0, selection: 2, combining: 4 });

export const IA_MODES = Object.freeze(['Off', 'Manual', 'Automatic']);
export const UNREGISTERED_ACTIONS = Object.freeze(['Allow', 'Warn', 'Block']);
// the IR preset's RF power: what the next transmitter sync applies. 0xff leaves the transmitter as it is.
export const RF_POWER_MODES = Object.freeze(['Low', 'Normal', 'High', 'No change']);
const RF_NO_CHANGE = 0xff;

const byIndex = (labels) => (raw) => labels[raw] ?? null;
const indexOf = (labels) => (label) => {
  const i = labels.findIndex((l) => l.toLowerCase() === String(label).trim().toLowerCase());
  return i < 0 ? null : i;
};

export const diversityLabel = (raw) => DIVERSITY_BY_RAW[raw] ?? null;
export const diversityRaw = (label) => DIVERSITY_RAW[String(label).trim().toLowerCase()] ?? null;
export const iaLabel = byIndex(IA_MODES);
export const iaIndex = indexOf(IA_MODES);
export const unregisteredLabel = byIndex(UNREGISTERED_ACTIONS);
export const unregisteredIndex = indexOf(UNREGISTERED_ACTIONS);
export const rfPowerLabel = (raw) => (raw === RF_NO_CHANGE ? 'No change' : (RF_POWER_MODES[raw] ?? null));
export const rfPowerRaw = (label) => {
  const i = RF_POWER_MODES.findIndex((m) => m.toLowerCase() === String(label).trim().toLowerCase());
  return i < 0 ? null : i === RF_POWER_MODES.length - 1 ? RF_NO_CHANGE : i;
};

export const khzToMhz = (khz) => Math.round(khz) / 1000;
export const mhzToKhz = (mhz) => Math.round(mhz * 1000);
export const quantizeKhz = (khz) => Math.round(khz / FREQ_RASTER_KHZ) * FREQ_RASTER_KHZ;
export const clampKhz = (khz) => Math.min(FREQ_MAX_KHZ, Math.max(FREQ_MIN_KHZ, khz));

/** Tone level as the dB the unit holds, or null when it is off. */
export const toneLevelDb = (raw) => (raw == null || raw <= TONE_OFF_DB ? null : raw);

// --- talk-switch routing ---------------------------------------------------------

/**
 * The talk switch gives each output two routings, one for each switch state. One
 * byte holds all eight, and a SET bit means that output is OFF.
 */
export const TALK_OUTPUTS = Object.freeze([
  { id: 'xlrNormal', bit: 0 },
  { id: 'trsNormal', bit: 1 },
  { id: 'aes3Normal', bit: 2 },
  { id: 'danteNormal', bit: 3 },
  { id: 'xlrPressed', bit: 4 },
  { id: 'trsPressed', bit: 5 },
  { id: 'aes3Pressed', bit: 6 },
  { id: 'dantePressed', bit: 7 },
]);

/** `{ xlrNormal: true, … }`: true when that routing is on. */
export function decodeTalk(value) {
  if (!value || value.length !== 1) return null;
  const out = {};
  for (const { id, bit } of TALK_OUTPUTS) out[id] = ((value[0] >> bit) & 1) === 0;
  return out;
}

/** The routing byte with one output switched on or off, the others as they were. */
export function withTalkOutput(current, outputId, on) {
  const output = TALK_OUTPUTS.find((o) => o.id === outputId);
  if (!output) throw new RangeError(`${outputId} is not a talk-switch output`);
  const mask = 1 << output.bit;
  return on ? current & ~mask & 0xff : (current | mask) & 0xff;
}

// --- the paired transmitter and the roster ---------------------------------------

/** Transmitter type GUIDs, as the roster reports them, and the model each names. */
export const TX_MODEL_BY_GUID = Object.freeze({
  'cd24aa1c-e139-11df-9057-0015c5f3f612': 'ADX2',
  '049c6918-fd5a-11e3-a641-0015c5f3f612': 'AD3',
});

const guidText = (v) => {
  const h = v.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** The model name in the transmitter bank, or null when no transmitter is paired. */
export const decodeTxModel = (v) => {
  const text = decodeString(v);
  return text ? text : null;
};
/** Eight hex digits, or null for the all-ones "none" sentinel. */
export const decodeTxSerial = (v) =>
  v && v.length === 4 && v.readUInt32BE(0) !== 0xffffffff ? v.toString('hex') : null;
/** Battery percent, or null for the "none" sentinel. */
export const decodeTxBattery = (v) => (v && v.length === 1 && v[0] <= 100 ? v[0] : null);

const rosterSlotOf = (obj, base) => (obj >= base && obj < base + ROSTER_SLOTS ? obj - base + 1 : null);
const isZero = (v) => v.every((b) => b === 0);

/** One roster identity: `{ slot, serial }`, or null for an empty slot. */
const decodeRosterId = (slot) => (v) => (v.length === 16 && !isZero(v) ? { slot, serial: v.subarray(1, 4).toString('hex') } : null);
/** One roster type GUID: `{ slot, guid, model }`, or null for an empty slot. */
const decodeRosterGuid = (slot) => (v) => {
  if (v.length !== 16 || isZero(v)) return null;
  const guid = guidText(v);
  return { slot, guid, model: TX_MODEL_BY_GUID[guid] ?? null };
};

/** Addresses of every roster slot on a channel. */
export const rosterAddrs = (channel) =>
  Array.from({ length: ROSTER_SLOTS }, (_, i) => [
    chanAddr(channel, ROSTER_ID_BASE + i),
    chanAddr(channel, ROSTER_GUID_BASE + i),
  ]).flat();

/** The address that holds roster slot `slot` (1-based) on `channel`. */
export const rosterIdAddr = (channel, slot) => chanAddr(channel, ROSTER_ID_BASE + slot - 1);

// --- what is read --------------------------------------------------------------

/** Channel settings, read at connect and refreshed on a timer; each also arrives as an EVENT. */
/**
 * The sync presets, each with the labels Workbench shows and the byte each one is. `ff` is
 * "No change". A value not listed decodes as `#n` and cannot be written; the lists hold what has
 * been read from a unit plus the obvious neighbours (marked), which the unit's read-back checks.
 */
export const SYNC_NO_CHANGE = 'No change';
const dbRange = (lo, hi) => Object.fromEntries(Array.from({ length: hi - lo + 1 }, (_, i) => [`${lo + i} dB`, lo + i]));
export const SYNC_PRESETS = Object.freeze({
  syncRfPower: { obj: CH.SYNC_RF_POWER, values: { Normal: 0, High: 1, Low: 2 } }, // Low assumed
  syncBodypackPad: { obj: CH.SYNC_BP_PAD, values: { Off: 0, On: 1 } }, // On assumed
  syncBodypackOffset: { obj: CH.SYNC_BP_OFFSET, values: dbRange(0, 21) },
  syncHandheldOffset: { obj: CH.SYNC_HH_OFFSET, values: dbRange(0, 21) },
  syncPlugOnPhantom: { obj: CH.SYNC_PLUGON_PHANTOM, values: { Off: 0, '+48 V': 48 } }, // Off assumed
  syncPlugOnPad: { obj: CH.SYNC_PLUGON_PAD, values: { '-12 dB': -12, '0 dB': 0, '+12 dB': 12 }, signed: true }, // -12 and 0 assumed
  syncPlugOnOffset: { obj: CH.SYNC_PLUGON_OFFSET, values: dbRange(0, 21) },
  syncPlugOnHpf: { obj: CH.SYNC_PLUGON_HPF, values: { Off: 0, '180 Hz': 180 } }, // Off assumed
  syncPolarity: { obj: CH.SYNC_POLARITY, values: { Positive: 0, Negative: 1 } },
  syncMuteMode: { obj: CH.SYNC_MUTE_MODE, values: { Off: 0, On: 1 } }, // Off assumed
  syncLocks: { obj: CH.SYNC_LOCKS, values: { None: 0, Power: 2, Menu: 4, All: 6 } }, // None and All assumed
  syncBattery: { obj: CH.SYNC_BATTERY, values: { NiMH: 3 } },
  syncCustomGroups: { obj: CH.SYNC_CUSTOM_GROUPS, values: { Off: 0, On: 1 } }, // On assumed
});
export const syncOptions = (key) => [...Object.keys(SYNC_PRESETS[key].values), SYNC_NO_CHANGE];
export function syncLabel(key, v) {
  if (!v || v.length !== 1) return null;
  if (v[0] === 0xff) return SYNC_NO_CHANGE;
  const n = SYNC_PRESETS[key].signed ? v.readInt8(0) : v[0];
  const hit = Object.entries(SYNC_PRESETS[key].values).find(([, raw]) => raw === n);
  return hit ? hit[0] : `#${n}`;
}
export function syncRaw(key, label) {
  if (label === SYNC_NO_CHANGE) return 0xff;
  const raw = SYNC_PRESETS[key].values[label];
  return raw === undefined ? null : raw & 0xff;
}

export const CHANNEL_PROPS = Object.freeze([
  { key: 'name', obj: CH.NAME, decode: decodeString },
  // ANX4 only (`anx4: true`): an AD4Q/AD4D refuses these, so they are not asked of one
  { key: 'band', obj: CH.BAND, decode: (v) => { const s = decodeString(v); return isBandName(s) ? s : null; }, nullable: true, anx4: true },
  ...Object.entries(SYNC_PRESETS).map(([key, p]) => ({ key, obj: p.obj, decode: (v) => syncLabel(key, v), anx4: true })),
  { key: 'gainDb', obj: CH.GAIN_DB, decode: (v) => (v.length === 1 ? decodeInt(v) : null) },
  { key: 'muted', obj: CH.MUTE, decode: decodeBool },
  { key: 'overloadHold', obj: CH.OVERLOAD_HOLD, decode: decodeBool },
  { key: 'talk', obj: CH.TALK_ROUTING, decode: decodeTalk },
  { key: 'toneActive', obj: CH.TONE_ACTIVE, decode: decodeBool },
  { key: 'toneFreqHz', obj: CH.TONE_FREQ_HZ, decode: (v) => (v.length === 2 ? decodeUint(v) : null) },
  { key: 'toneLevelDb', obj: CH.TONE_LEVEL_DB, decode: (v) => (v.length === 1 ? decodeInt(v) : null) },
  { key: 'frequencyMhz', obj: CH.FREQ_KHZ, decode: (v) => (v.length === 4 ? khzToMhz(decodeUint(v)) : null) },
  { key: 'diversity', obj: CH.DIVERSITY, decode: (v) => diversityLabel(decodeUint(v)) },
  { key: 'interferenceAvoidance', obj: CH.INTERFERENCE_AVOIDANCE, decode: (v) => iaLabel(decodeUint(v)) },
  { key: 'unregisteredTx', obj: CH.UNREGISTERED_TX, decode: (v) => unregisteredLabel(decodeUint(v)) },
  { key: 'rfPower', obj: CH.RF_POWER, decode: (v) => rfPowerLabel(decodeUint(v)) },
  { key: 'encryption', obj: CH.ENCRYPTION, decode: (v) => (decodeUint(v) ? 'On' : 'Off') },
  // absence is a value here: a transmitter leaving must clear what was shown
  { key: 'txModel', obj: CH.TX_MODEL, decode: decodeTxModel, nullable: true },
  { key: 'txSerial', obj: CH.TX_SERIAL, decode: decodeTxSerial, nullable: true },
  { key: 'txBattery', obj: CH.TX_BATTERY, decode: decodeTxBattery, nullable: true },
]);

/**
 * The live meters, subscribed to rather than polled: the RF level at each antenna
 * (tenths of a dBm on the wire) and the audio level (dB, -115 at silence).
 */
export const METER_PROPS = Object.freeze([
  { key: 'rfADbm', obj: CH.RF_LEVEL_A, decode: (v) => (v.length === 2 ? v.readInt16BE(0) / 10 : null) },
  { key: 'rfBDbm', obj: CH.RF_LEVEL_B, decode: (v) => (v.length === 2 ? v.readInt16BE(0) / 10 : null) },
  { key: 'audioDb', obj: CH.AUDIO_LEVEL, decode: (v) => (v.length === 4 ? v.readInt32BE(0) : null) },
]);

export const DEVICE_PROPS = Object.freeze([
  { key: 'model', addr: DEV.MODEL, decode: decodeString },
  { key: 'serial', addr: DEV.SERIAL, decode: decodeString },
  { key: 'name', addr: DEV.NAME, decode: decodeString },
  { key: 'powerLock', addr: DEV.POWER_LOCK, decode: decodeBool },
  { key: 'fanAlwaysOn', addr: DEV.FAN_ALWAYS_ON, decode: decodeBool },
  { key: 'band', addr: DEV.BAND, decode: decodeString },
  { key: 'hdMode', addr: DEV.HD_MODE, decode: decodeBool },
  { key: 'quadversity', addr: DEV.QUADVERSITY, decode: decodeBool },
  { key: 'antennaBias', addr: DEV.ANTENNA_BIAS, decode: decodeBool },
  { key: 'panelLock', addr: DEV.PANEL_LOCK, decode: decodeBool },
  { key: 'antennaA', addr: DEV.ANTENNA_A, decode: decodeString, anx4: true },
  { key: 'antennaB', addr: DEV.ANTENNA_B, decode: decodeString, anx4: true },
  { key: 'antennaC', addr: DEV.ANTENNA_C, decode: decodeString, anx4: true },
  { key: 'antennaD', addr: DEV.ANTENNA_D, decode: decodeString, anx4: true },
  // what the unit will scan, in kHz; the start and stop follow the band and are pushed when it changes
  { key: 'scanStartKhz', addr: SCAN_LIMITS.START, decode: decodeUint },
  { key: 'scanStopKhz', addr: SCAN_LIMITS.STOP, decode: decodeUint },
]);

const CHANNEL_PROP_BY_OBJ = new Map(
  [...CHANNEL_PROPS, ...METER_PROPS].map((prop) => [prop.obj, prop])
);
const DEVICE_PROP_BY_ADDR = new Map(DEVICE_PROPS.map((prop) => [prop.addr, prop]));

/**
 * Decodes one property into `{ channel, key, value }` (`channel` is null for a
 * device property), or null for an address the plugin does not model.
 */
export function decodeProp(addr, value) {
  const split = splitAddr(addr);
  if (split) {
    const prop = CHANNEL_PROP_BY_OBJ.get(split.obj);
    if (prop) return { channel: split.channel, key: prop.key, value: prop.decode(value), nullable: !!prop.nullable };
    const idSlot = rosterSlotOf(split.obj, ROSTER_ID_BASE);
    if (idSlot) return { channel: split.channel, key: 'rosterId', value: decodeRosterId(idSlot)(value), nullable: false };
    const guidSlot = rosterSlotOf(split.obj, ROSTER_GUID_BASE);
    if (guidSlot) return { channel: split.channel, key: 'rosterGuid', value: decodeRosterGuid(guidSlot)(value), nullable: false };
    return null;
  }
  const prop = DEVICE_PROP_BY_ADDR.get(addr);
  return prop ? { channel: null, key: prop.key, value: prop.decode(value), nullable: false } : null;
}
