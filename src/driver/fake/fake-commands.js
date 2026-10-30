// The command-strings side of the simulated unit: a TCP server speaking Shure's `< GET / REP >`
// protocol from a small per-channel table, with the transmitter and slot events a test can raise.

import net from 'node:net';

const pad = (s, n) => `{${String(s).padEnd(n)}}`;

export class FakeCommandServer {
  constructor({ channels = 4, model = 'AD4Q-A', host = '127.0.0.1' } = {}) {
    this.channels = channels;
    this.host = host;
    this.device = { MODEL: pad(model, 32), FW_VER: pad('1.5.4.0', 24), RF_BAND: pad('G57', 8), ENCRYPTION_MODE: 'OFF', TRANSMISSION_MODE: 'STANDARD', QUADVERSITY_MODE: 'OFF' };
    this.channel = {};
    for (let c = 1; c <= channels; c += 1) {
      this.channel[c] = {
        TX_MODEL: 'UNKNOWN', TX_DEVICE_ID: pad('', 31), TX_BATT_CHARGE_PERCENT: '255', TX_BATT_BARS: '255', TX_BATT_MINS: '65535', TX_BATT_TYPE: 'UNKN',
        TX_POWER_LEVEL: '255', TX_MUTE_MODE_STATUS: 'UNKNOWN', TX_TALK_SWITCH: 'UNKNOWN', TX_LOCK: 'UNKNOWN',
        ENCRYPTION_STATUS: 'OK', INTERFERENCE_STATUS: 'NONE', UNREGISTERED_TX_STATUS: 'OK',
        slots: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, { SLOT_STATUS: 'EMPTY', SLOT_SHOWLINK_STATUS: '255', SLOT_TX_MODEL: 'UNKNOWN' }])),
      };
    }
    this.server = null;
    this.clients = new Set();
    this.meterTimers = {};
    /** every identify received: null for the device, else the channel */
    this.flashes = [];
    /** the channel quality each channel samples, 0..5 */
    this.quality = Object.fromEntries(Array.from({ length: channels }, (_, i) => [i + 1, 0]));
    /** every GET received, for tests */
    this.gets = [];
  }

  get port() {
    return this.server?.address().port;
  }

  async listen() {
    this.server = net.createServer((socket) => {
      this.clients.add(socket);
      let buf = '';
      socket.on('data', (d) => {
        buf += d.toString('latin1');
        let i;
        while ((i = buf.indexOf('>')) >= 0) {
          const frame = buf.slice(buf.indexOf('<'), i + 1);
          buf = buf.slice(i + 1);
          this.#onFrame(socket, frame);
        }
      });
      socket.on('close', () => this.clients.delete(socket));
      socket.on('error', () => {});
    });
    await new Promise((resolve) => this.server.listen(0, this.host, resolve));
  }

  async stop() {
    for (const t of Object.values(this.meterTimers)) clearInterval(t);
    for (const c of this.clients) c.destroy();
    await new Promise((resolve) => (this.server ? this.server.close(resolve) : resolve()));
  }

  #onFrame(socket, frame) {
    const flash = /^<\s*SET\s+(?:(\d{1,2})\s+)?FLASH\s+(ON|OFF)\s*>$/.exec(frame);
    if (flash) {
      const channel = flash[1] === undefined ? null : Number(flash[1]);
      this.flashes.push(channel);
      const at = channel == null ? '' : `${channel} `;
      socket.write(`< REP ${at}FLASH ${flash[2]} >`);
      // the unit flashes for a while, then reports that it stopped
      const t = setTimeout(() => socket.write(`< REP ${at}FLASH OFF >`), 300);
      t.unref?.();
      return;
    }
    const rate = /^<\s*SET\s+(\d{1,2})\s+METER_RATE\s+(\d+)\s*>$/.exec(frame);
    if (rate) {
      const channel = Number(rate[1]);
      const ms = Number(rate[2]);
      clearInterval(this.meterTimers[channel]);
      delete this.meterTimers[channel];
      socket.write(`< REP ${channel} METER_RATE ${String(ms).padStart(5, '0')} >`);
      if (ms >= 100) {
        this.meterTimers[channel] = setInterval(() => {
          const q = String(this.quality[channel] ?? 0).padStart(3, '0');
          const ant = this.channel[channel].TX_MODEL === 'UNKNOWN' ? 'XX' : 'BB';
          socket.write(`< SAMPLE ${channel} ALL ${q} 000 020 020 ${ant} 00 010 00 010 >`);
        }, ms);
        this.meterTimers[channel].unref?.();
      }
      return;
    }
    const m = /^<\s*GET\s+(?:(\d{1,2})\s+)?([A-Z_0-9]+)(?:\s+(\d{1,2}))?\s*>$/.exec(frame);
    if (!m) return;
    const [, ch, prop, slot] = m;
    this.gets.push(frame);
    const send = (s) => socket.write(s);
    if (ch === undefined) {
      if (prop in this.device) send(`< REP ${prop} ${this.device[prop]} >`);
      else send('< REP ERR >');
      return;
    }
    const channel = this.channel[Number(ch)];
    if (!channel) return send('< REP ERR >');
    if (prop.startsWith('SLOT_')) {
      const slots = slot === '0' || slot === undefined ? Object.keys(channel.slots) : [slot];
      for (const s of slots) send(`< REP ${ch} ${prop} ${s} ${channel.slots[s][prop] ?? '255'} >`);
      return;
    }
    if (prop in channel) send(`< REP ${ch} ${prop} ${channel[prop]} >`);
    else send('< REP ERR >');
  }

  #report(line) {
    for (const c of this.clients) c.write(line);
  }

  /** A transmitter comes in on a channel: the unit reports what it decodes, as it does on the air. */
  receiveTransmitter(channel, { model = 'ADX2', deviceId = 'LeadVox', batteryPercent = 88, batteryMinutes = 125, powerMw = 10, muteMode = 'ON' } = {}) {
    const ch = this.channel[channel];
    const set = (prop, value) => {
      ch[prop] = value;
      this.#report(`< REP ${channel} ${prop} ${value} >`);
    };
    set('TX_MODEL', model);
    set('TX_DEVICE_ID', pad(deviceId, 31));
    set('TX_BATT_CHARGE_PERCENT', String(batteryPercent).padStart(3, '0'));
    set('TX_BATT_BARS', String(Math.round(batteryPercent / 20)).padStart(3, '0'));
    set('TX_BATT_MINS', String(batteryMinutes).padStart(5, '0'));
    set('TX_POWER_LEVEL', String(powerMw).padStart(3, '0'));
    set('TX_MUTE_MODE_STATUS', muteMode);
  }

  /** The transmitter goes away: everything about it is unknown again. */
  loseTransmitter(channel) {
    const ch = this.channel[channel];
    const set = (prop, value) => {
      ch[prop] = value;
      this.#report(`< REP ${channel} ${prop} ${value} >`);
    };
    set('TX_MODEL', 'UNKNOWN');
    set('TX_DEVICE_ID', pad('', 31));
    set('TX_BATT_CHARGE_PERCENT', '255');
    set('TX_BATT_BARS', '255');
    set('TX_BATT_MINS', '65535');
    set('TX_POWER_LEVEL', '255');
    set('TX_MUTE_MODE_STATUS', 'UNKNOWN');
    set('TX_TALK_SWITCH', 'UNKNOWN');
  }

  /** A registered slot changes: `setSlot(1, 2, { status: 'LINKED.ACTIVE', showLink: 5, model: 'ADX2' })`. */
  setSlot(channel, slot, { status, showLink, model } = {}) {
    const s = this.channel[channel].slots[slot];
    const set = (prop, value) => {
      s[prop] = value;
      this.#report(`< REP ${channel} ${prop} ${slot} ${value} >`);
    };
    if (model !== undefined) set('SLOT_TX_MODEL', model);
    if (status !== undefined) set('SLOT_STATUS', status);
    if (showLink !== undefined) set('SLOT_SHOWLINK_STATUS', String(showLink).padStart(3, '0'));
  }

  /** A channel status flag changes: `setStatus(1, 'INTERFERENCE_STATUS', 'DETECTED')`. */
  setStatus(channel, prop, value) {
    this.channel[channel][prop] = value;
    this.#report(`< REP ${channel} ${prop} ${value} >`);
  }
}
