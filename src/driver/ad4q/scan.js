// The receiver's RF scan, as a plain description: the keys it is driven with, how its
// frequency index maps to MHz, and what a scan may ask for. No I/O here.
//
// A scan is one antenna at a time, over a range chosen up front, delivered as a stream of
// 16-sample chunks. The unit numbers its samples by an index counted from the bottom of its
// frequency range at its own step, and it publishes that origin, step and the range it will
// scan (`SCAN_LIMITS`), so nothing here depends on which of the A, B or C ranges a unit is.

/** The step the unit reports for every receiver seen so far; used only as a default. */
export const SCAN_STEP_KHZ = 25;
/** The resolution bandwidth the unit is asked for; its unit is not confirmed. */
export const SCAN_RBW = 200;
/** About how long the unit takes per point, from a full-range scan (118 s for 5511 points). */
export const SCAN_MS_PER_POINT = 21.5;

/** The antennas a scan can be taken from, with the curve bit it is selected by and the curve it streams as. */
export const ANTENNAS = Object.freeze({
  A: { select: 0x02, curve: 1 },
  B: { select: 0x04, curve: 2 },
});

/**
 * Object ids on a channel: the claim (a read, made first: without it the unit refuses the scan's
 * configuration), the trigger that starts a scan, and the release that ends it. A release also
 * stops a scan that is still running, and the unit is idle again within about half a second.
 */
export const SCAN_OBJ = Object.freeze({ START: 0x0903, RELEASE: 0x090e, CLAIM: 0x090f });

/**
 * Properties on the unit that describe its scan, in kHz: the range it will scan, where its index
 * starts counting, and its step. Readable by any session.
 */
export const SCAN_LIMITS = Object.freeze({ START: 0x01070001, STOP: 0x01070002, ORIGIN: 0x01070201, STEP: 0x01070202 });

/** `CURRENT_STATUS` values the unit reports. */
export const SCAN_STATUS = Object.freeze({ IDLE: 0, ACTIVE: 2, FINISHING: 3 });

const scanKey = (name, ch) => `RF_SCAN:${name}/CH=${ch}/SCAN=0`;

/** The keys a scan watches for status. `ch` is the zero-based channel. */
export const statusKeys = (ch) => ({
  status: scanKey('CURRENT_STATUS', ch),
  sweepId: scanKey('CURRENT_SWEEP_ID', ch),
  progress: scanKey('CURRENT_SWEEP_STATUS', ch),
});

export const configKeys = (ch) => ({
  start: scanKey('SCAN_START_FREQ', ch),
  stop: scanKey('SCAN_STOP_FREQ', ch),
  step: scanKey('SCAN_STEP_FREQ', ch),
  rbw: scanKey('SCAN_RESOLUTION_BW', ch),
  repeat: scanKey('SCAN_REPEAT_REQUEST', ch),
  curve: scanKey('CURVE_SELECT', ch),
});

/** The key the sample stream is subscribed under; the planned index range is declared in it. It starts with a 0x26 marker byte. */
export const dataKey = (ch, curve, lo, hi) => `&RF_SCAN_DATA:RSSI/CH=${ch}/SCAN=0/CURVE_IDX=${curve}/FREQ_IDX=${lo}-${hi}`;

const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
};

/** The configuration written to the unit before a scan, in the order Wireless Workbench writes it. */
export function configEntries(ch, { startKhz, stopKhz, stepKhz = SCAN_STEP_KHZ, antenna }) {
  const keys = configKeys(ch);
  return [
    { key: keys.start, value: u32(startKhz) },
    { key: keys.stop, value: u32(stopKhz) },
    { key: keys.step, value: u32(stepKhz) },
    { key: keys.rbw, value: u32(SCAN_RBW) },
    { key: keys.repeat, value: Buffer.from([1]) },
    { key: keys.curve, value: u32(ANTENNAS[antenna].select) },
  ];
}

/**
 * What a scan will actually cover. The request is snapped inward to the unit's own raster (counted
 * from its origin) and held inside the range the unit reports; null when nothing is left.
 * `limits` is `{ startKhz, stopKhz, originKhz, stepKhz }` as read from the unit.
 */
export function planScan({ limits, startKhz, stopKhz }) {
  const { originKhz, stepKhz } = limits;
  if (!(stepKhz > 0)) return null;
  const lo = Math.ceil((Math.max(startKhz, limits.startKhz) - originKhz) / stepKhz);
  const hi = Math.floor((Math.min(stopKhz, limits.stopKhz) - originKhz) / stepKhz);
  if (!(hi > lo)) return null;
  return {
    originKhz,
    stepKhz,
    loIndex: lo,
    hiIndex: hi,
    points: hi - lo + 1,
    startKhz: originKhz + lo * stepKhz,
    stopKhz: originKhz + hi * stepKhz,
  };
}

/** The whole of what a unit will scan. */
export const defaultSpan = (limits) => ({ startKhz: limits.startKhz, stopKhz: limits.stopKhz });

/** About how long a scan of `points` points takes, one antenna. */
export const scanDurationMs = (points) => Math.round(points * SCAN_MS_PER_POINT);

/**
 * One chunk of the sample stream, or null if this is not one. `key` carries the curve and
 * the indices the chunk covers; `value` is [2B length][4B count][1B width][count x int16 BE, dBm x 10].
 */
export function parseDataEvent(key, value) {
  const m = /RF_SCAN_DATA:RSSI\/CH=\d+\/SCAN=\d+\/CURVE_IDX=(\d+)\/FREQ_IDX=(\d+)-(\d+)/.exec(key);
  if (!m || value.length < 7) return null;
  const lo = Number(m[2]);
  const hi = Number(m[3]);
  const count = value.readUInt32BE(2);
  if (value[6] !== 2 || count !== hi - lo + 1 || value.length < 7 + count * 2) return null;
  const dbm = new Array(count);
  for (let i = 0; i < count; i += 1) dbm[i] = value.readInt16BE(7 + i * 2) / 10;
  return { curve: Number(m[1]), lo, hi, dbm };
}

/** The strongest of several equal-length curves at each point. */
export function peakOf(curves) {
  const first = curves[0];
  const out = new Array(first.length);
  for (let i = 0; i < first.length; i += 1) {
    let best = first[i];
    for (let c = 1; c < curves.length; c += 1) if (curves[c][i] > best) best = curves[c][i];
    out[i] = best;
  }
  return out;
}
