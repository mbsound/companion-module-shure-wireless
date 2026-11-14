// AD4D, AD4Q and ANX4, over the driver vendored from soundbase-plugin-shure-axient-digital (src/driver,
// see VENDORED.md), following how that plugin's adapter drives a unit:
//
//   ACN session  settings, live meters and the changes the unit pushes. Every write is read
//                back; reads are batched and windowed by the driver. Re-read on a slow timer
//                that stretches with the channel count, since the unit pushes changes anyway.
//   TCP 2202     transmitter, ShowLink slots, status flags and the SAMPLE line. One request at
//                a time, each waiting for its report; the meter rate is set back to 0 on close.
//
// Values from both sides are fed into the existing state store (internalAPI.js) in its 2202
// vocabulary, so every variable, feedback and icon keeps working with the same IDs.

import { Ad4qDevice, WriteRefused } from '../driver/ad4q/device.js'
import { SlpBrowser } from '../driver/acn/slp.js'
import { CommandClient, COMMAND_PORT, STATUS_PROPS, TX_PROPS } from '../driver/cmdstrings/client.js'
import {
	ANTENNA_SELECTIONS,
	TALK_OUTPUTS,
	CHANNEL_NAME_MAX,
	DEVICE_NAME_MAX,
	GAIN_MAX_DB,
	GAIN_MIN_DB,
	MAX_CHANNELS,
	clampKhz,
	isReceiverAdvert,
	khzToMhz,
	mhzToKhz,
	modelOf,
	quantizeKhz,
} from '../driver/ad4q/properties.js'

/** The reference adapter's timings. */
const REFRESH_MS = 5000
/** An ANX4 is re-read no more often than this. */
const LICENSED_MIN_REFRESH_MS = 60_000
const COMMAND_RETRY_MS = 10_000
/** The command-port retry backs off this far while the port keeps refusing (an ANX4 without command strings). */
const COMMAND_RETRY_MAX_MS = 60_000
/**
 * A unit that drops an established session twice within LOSS_WINDOW_MS is left alone for
 * STAND_DOWN_MS: two ANX4s on pre-1.2 firmware restarted about every 45 minutes under a monitoring
 * session, and every reconnect only started the next cycle.
 */
const LOSS_WINDOW_MS = 10 * 60_000
const STAND_DOWN_MS = 15 * 60_000
const DISCOVERY_MS = 6000
const RECONNECT_MIN_MS = 2000
const RECONNECT_MAX_MS = 30_000
/** How long closing may spend turning metering off before the sockets are dropped anyway. */
const CLOSE_DEADLINE_MS = 3000
/** ShowLink exists only on Axient Digital channels; an ANX4 has at most 16 of those. */
const SHOWLINK_MAX_CHANNELS = 16

/** Documented TX properties beyond the reference's set, which this module has always exposed. */
const EXTRA_CHANNEL_PROPS = Object.freeze([
	'TX_OFFSET',
	'TX_INPUT_PAD',
	'TX_POLARITY',
	'TX_BATT_CYCLE_COUNT',
	'TX_BATT_HEALTH_PERCENT',
	'TX_BATT_TEMP_C',
	'TX_BATT_TEMP_F',
	'GROUP_CHANNEL',
	'GROUP_CHANNEL2',
	'FREQUENCY2',
	'INTERFERENCE_STATUS2',
])
const ANX4_CHANNEL_PROPS = Object.freeze(['TX_PHANTOM_POWER', 'TX_HIGH_PASS_FILTER'])
/** Read for every slot with one `slot 0` GET each; the first three are the reference's. */
const SLOT_BATCH_PROPS = Object.freeze(['SLOT_STATUS', 'SLOT_SHOWLINK_STATUS', 'SLOT_TX_MODEL', 'SLOT_RF_OUTPUT'])
/** Read per registered slot only. */
const SLOT_DETAIL_PROPS = Object.freeze([
	'SLOT_TX_DEVICE_ID',
	'SLOT_RF_POWER_MODE',
	'SLOT_INPUT_PAD',
	'SLOT_POLARITY',
	'SLOT_OFFSET',
	'SLOT_BATT_BARS',
	'SLOT_BATT_MINS',
])
const ANX4_SLOT_DETAIL_PROPS = Object.freeze(['SLOT_PHANTOM_POWER', 'SLOT_HIGH_PASS_FILTER'])

const DIVERSITY_TOKEN = Object.freeze({ Off: 'OFF', Selection: 'FD-S', Combining: 'FD-C' })
const TRANSMISSION_MODE_TOKEN = Object.freeze({
	'ULX-D Standard': 'ULXD_STANDARD',
	'ULX-D High Density': 'ULXD_HIGH_DENSITY',
	'Axient Digital Standard': 'AD_STANDARD',
	'Axient Digital High Density': 'AD_HIGH_DENSITY',
})

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const isPrintable = (s) => /^[\x20-\x7e]*$/.test(s)

/** Session losses by host, kept across reconnects and config changes: `{ at: [ms...], until: ms }`. */
const losses = new Map()

/** One SLP browse per process, shared by every connection in it (UDP 8427 is a shared port). */
let sharedBrowser = null
function browserFor(host, log) {
	if (!sharedBrowser) {
		sharedBrowser = new SlpBrowser({ targets: [], filter: isReceiverAdvert, log })
	}
	const targets = new Set(sharedBrowser.targets)
	targets.add(host)
	sharedBrowser.setTargets([...targets])
	return sharedBrowser
}

export class AxientBackend {
	/**
	 * @param {{
	 *   api: import('../internalAPI.js').default,
	 *   model: { id: string, channels: number },
	 *   config: { host: string, port?: number|string, meteringOn?: boolean, meteringInterval?: number, acnCid?: string },
	 *   log: (level: string, message: string) => void,
	 *   status: (status: string, message?: string) => void,
	 *   checkFeedbacks: (...ids: string[]) => void,
	 *   saveCid?: (cid: string|null) => void,
	 *   channelCount?: (n: number) => void,
	 *   driver?: object,
	 *   timings?: { lossWindowMs?: number, standDownMs?: number },
	 * }} ctx  `driver` overrides the device options (tests: a simulator's port, cid and timings)
	 */
	constructor(ctx) {
		this.ctx = ctx
		this.api = ctx.api
		this.host = String(ctx.config.host ?? '').trim()
		this.licensed = ctx.model.id === 'anx4'
		this.channels = this.licensed ? null : ctx.model.channels
		this.commandPort = Number(ctx.config.port) || COMMAND_PORT
		this.unit = null
		this.commands = null
		this.commandsLive = false
		this.cmdChain = Promise.resolve()
		this.writes = Promise.resolve()
		this.meters = {}
		this.metersDirty = new Set()
		this.channelBands = {}
		this.deviceBand = null
		this.transmissionMode = null
		this.timers = { refresh: null, meters: null, reconnect: null, commandRetry: null }
		this.reconnectMs = RECONNECT_MIN_MS
		this.commandRetryMs = null
		this.timings = { lossWindowMs: LOSS_WINDOW_MS, standDownMs: STAND_DOWN_MS, ...ctx.timings }
		this.closed = false
	}

	log(level, message) {
		this.ctx.log(level, message)
	}

	// --- lifecycle ---------------------------------------------------------------------------

	start() {
		this.#startMeterFlush()
		void this.#connectUnit()
	}

	async stop() {
		this.closed = true
		for (const key of Object.keys(this.timers)) {
			clearTimeout(this.timers[key])
			clearInterval(this.timers[key])
			this.timers[key] = null
		}
		const unit = this.unit
		this.unit = null
		await Promise.allSettled([unit?.close(), this.#closeCommands()])
	}

	/** Meter publishing follows the module's metering settings; the subscriptions do not change. */
	applyMetering(config) {
		this.ctx.config = { ...this.ctx.config, meteringOn: config.meteringOn, meteringInterval: config.meteringInterval }
		this.#startMeterFlush()
		if (this.commands?.connected) void this.#cmd((c) => this.#setMeterRates(c, this.#sampleRate())).catch(() => {})
	}

	#meterMs() {
		return clamp(Number(this.ctx.config.meteringInterval) || 1000, 100, 65_535)
	}

	/** The SAMPLE rate asked of the unit: the metering interval, or 0 (off). */
	#sampleRate() {
		return this.ctx.config.meteringOn === false ? 0 : this.#meterMs()
	}

	#startMeterFlush() {
		clearInterval(this.timers.meters)
		this.timers.meters = setInterval(() => this.#flushMeters(), this.#meterMs())
		this.timers.meters.unref?.()
	}

	#flushMeters() {
		if (this.ctx.config.meteringOn === false) {
			this.metersDirty.clear()
			return
		}
		for (const channel of this.metersDirty) this.api.applyAcnMeters(channel, this.meters[channel])
		this.metersDirty.clear()
	}

	// --- the ACN session ---------------------------------------------------------------------

	async #connectUnit() {
		if (this.closed) return
		const until = this.#standDownUntil()
		if (until) {
			this.ctx.status('connection_failure', this.#standDownMessage(until))
			this.#scheduleReconnect(until - Date.now())
			return
		}
		this.ctx.status('connecting', `Connecting to ${this.host}`)
		let unit = null
		try {
			const cid = this.#storedCid()
			const options = { host: this.host, log: (l, m) => this.log(l, m), licensed: this.licensed }
			if (this.channels) options.channels = this.channels
			if (cid) options.cid = cid
			else options.browser = browserFor(this.host, (l, m) => this.log(l, m))
			// a unit found by SLP gives its session port in the advert; one with a stored id uses the default
			unit = new Ad4qDevice({ ...options, ...(this.ctx.driver ?? {}) })
			unit.on('prop', (change) => this.#applyProp(change))
			unit.on('lost', (err) => this.#unitLost(unit, err))
			this.unit = unit
			try {
				await unit.connect()
			} catch (err) {
				if (cid && !this.ctx.driver?.cid) {
					// the stored id may belong to a unit that has been replaced: look it up again next time
					this.ctx.saveCid?.(null)
				}
				if (!cid && !unit.cid) {
					throw new Error(
						`no Axient Digital receiver answered discovery at ${this.host} (SLP, UDP 8427). ` +
							'Companion must be on the same network segment as the receiver.'
					)
				}
				throw err
			}
			if (this.closed || this.unit !== unit) {
				await unit.close()
				return
			}
			if (!cid && unit.cid) this.ctx.saveCid?.(unit.cid)
			this.#checkModel(unit)
			if (this.licensed) {
				this.channels = unit.channels
				this.ctx.channelCount?.(unit.channels)
				this.api.updateReceiver('NUMBER_CHANNELS_LICENSED', String(unit.channels))
			}
			if (this.licensed && !unit.stringKeys) {
				this.log(
					'info',
					`ANX4 firmware ${
						unit.firmware ?? 'unknown'
					}: the antenna pairs and transmission mode are not read or set below firmware 1.2`
				)
			}
			await this.#refresh()
			await unit.subscribeAll()
			this.reconnectMs = RECONNECT_MIN_MS
			const every = Math.max(
				REFRESH_MS * Math.max(1, Math.ceil(unit.channels / 4)),
				this.licensed ? LICENSED_MIN_REFRESH_MS : 0
			)
			clearInterval(this.timers.refresh)
			this.timers.refresh = setInterval(() => this.#refresh().catch(() => {}), every)
			this.timers.refresh.unref?.()
			this.log('info', `connected to ${this.host}: ${unit.channels} channel${unit.channels === 1 ? '' : 's'}`)
			this.#reportStatus()
			void this.#openCommands()
		} catch (err) {
			if (this.unit === unit) this.unit = null
			await unit?.close().catch(() => {})
			if (this.closed) return
			this.log('warn', `connection failed: ${err.message}`)
			this.ctx.status('connection_failure', err.message)
			this.#scheduleReconnect()
		}
	}

	#storedCid() {
		if (this.ctx.driver?.cid) return this.ctx.driver.cid
		const cid = String(this.ctx.config.acnCid ?? '')
			.replace(/[^0-9a-f]/gi, '')
			.toLowerCase()
		return cid.length === 32 ? cid : null
	}

	/** An ANX4 set up as an AD4D/AD4Q (or the reverse) still connects, with a warning. */
	#checkModel(unit) {
		if (unit.licensed === this.licensed) return
		const configured = this.ctx.model.id.toUpperCase()
		this.log(
			'warn',
			`${this.host} ${
				unit.licensed ? 'is an ANX4' : 'is not an ANX4'
			}, but the connection is set to ${configured}; choose the matching model`
		)
	}

	/** Reconnect after the backoff, or after `waitMs` when given (the end of a stand-down). */
	#scheduleReconnect(waitMs) {
		if (this.closed) return
		clearTimeout(this.timers.reconnect)
		let wait = waitMs
		if (wait === undefined) {
			wait = this.reconnectMs
			this.reconnectMs = Math.min(RECONNECT_MAX_MS, this.reconnectMs * 2)
		}
		this.timers.reconnect = setTimeout(() => void this.#connectUnit(), Math.max(0, wait))
		this.timers.reconnect.unref?.()
	}

	#standDownUntil(now = Date.now()) {
		const entry = losses.get(this.host)
		return entry && entry.until > now ? entry.until : null
	}

	#standDownMessage(until) {
		const minutes = Math.round(this.timings.lossWindowMs / 60_000)
		return (
			`Standing down until ${new Date(until).toLocaleTimeString()}: the receiver dropped the session twice in ` +
			`${minutes} minutes, so it is left alone rather than reconnected into another restart`
		)
	}

	/** Record a lost session; returns when a stand-down ends, if this loss starts one. */
	#recordLoss(now = Date.now()) {
		const entry = losses.get(this.host) ?? { at: [], until: 0 }
		entry.at = entry.at.filter((t) => now - t < this.timings.lossWindowMs)
		entry.at.push(now)
		if (entry.at.length >= 2) {
			entry.until = now + this.timings.standDownMs
			entry.at = []
		}
		losses.set(this.host, entry)
		return entry.until > now ? entry.until : null
	}

	#unitLost(unit, err) {
		if (this.closed || unit !== this.unit) return
		this.log('warn', `the session with ${this.host} was lost: ${err.message}`)
		this.unit = null
		clearInterval(this.timers.refresh)
		this.timers.refresh = null
		void unit.close().catch(() => {})
		const until = this.#recordLoss()
		if (until) {
			// no session and no probing of the control port either, until the stand-down ends
			this.log('warn', this.#standDownMessage(until))
			clearTimeout(this.timers.commandRetry)
			void this.#closeCommands()
			this.ctx.status('connection_failure', this.#standDownMessage(until))
			this.#scheduleReconnect(until - Date.now())
			return
		}
		this.ctx.status('connection_failure', `Lost the session: ${err.message}`)
		this.#scheduleReconnect()
	}

	async #refresh() {
		const unit = this.unit
		if (!unit?.connected) return
		if (this.refreshing) return this.refreshing
		this.refreshing = (async () => {
			// every reply also arrives as a 'prop' event and is applied there; only the ANX4's
			// string-keyed values (antenna pair, transmission mode) come back in the result alone
			const all = await unit.readAll()
			const answered =
				Object.keys(all.device).length + Object.values(all.channels).reduce((n, c) => n + Object.keys(c).length, 0)
			if (answered === 0) {
				this.#unitLost(unit, new Error('the unit stopped answering'))
				return
			}
			if (all.device.transmissionMode)
				this.#applyProp({ channel: null, key: 'transmissionMode', value: all.device.transmissionMode })
			for (const [c, props] of Object.entries(all.channels)) {
				if (props.antenna) this.#applyProp({ channel: Number(c), key: 'antenna', value: props.antenna })
			}
		})().finally(() => {
			this.refreshing = null
		})
		return this.refreshing
	}

	/** One value from the ACN session, into the state store in its 2202 vocabulary. */
	#applyProp({ channel, key, value }) {
		const api = this.api
		if (channel == null) {
			switch (key) {
				case 'name':
					api.updateReceiver('DEVICE_ID', value)
					break
				case 'firmware':
					api.updateReceiver('FW_VER', value)
					break
				case 'model':
					api.updateReceiver('MODEL', value)
					break
				case 'band':
					this.deviceBand = value
					api.updateReceiver('RF_BAND', value)
					break
				case 'hdMode':
					// an ANX4 reports its mode as a transmission mode instead
					if (!this.licensed) api.updateReceiver('HIGH_DENSITY', value ? 'ON' : 'OFF')
					break
				case 'quadversity':
					api.updateReceiver('QUADVERSITY_MODE', value ? 'ON' : 'OFF')
					break
				case 'transmissionMode':
					this.transmissionMode = value
					api.updateReceiver('TRANSMISSION_MODE', TRANSMISSION_MODE_TOKEN[value] ?? value)
					break
			}
			return
		}
		switch (key) {
			case 'rfADbm':
			case 'rfBDbm':
			case 'audioDb': {
				const m = (this.meters[channel] ??= {})
				m[key === 'rfADbm' ? 'rfA' : key === 'rfBDbm' ? 'rfB' : 'audio'] = value
				this.metersDirty.add(channel)
				break
			}
			case 'name':
				api.updateChannel(channel, 'CHAN_NAME', value)
				break
			case 'gainDb':
				api.updateChannel(channel, 'AUDIO_GAIN', String(value + 18))
				break
			case 'muted':
				api.updateChannel(channel, 'AUDIO_MUTE', value ? 'ON' : 'OFF')
				break
			case 'frequencyMhz':
				api.updateChannel(channel, 'FREQUENCY', String(mhzToKhz(value)))
				break
			case 'diversity':
				if (DIVERSITY_TOKEN[value]) api.updateChannel(channel, 'FD_MODE', DIVERSITY_TOKEN[value])
				break
			case 'encryption': {
				const on = value === 'On' ? 'ON' : 'OFF'
				api.updateChannel(channel, 'ENCRYPTION_MODE', on)
				if (channel === 1) api.updateReceiver('ENCRYPTION_MODE', on)
				break
			}
			case 'band':
				// an ANX4 has a band per channel and none for the unit: show them together. The driver
				// gives null where the channel holds no band (a ULX-D mode), which clears that channel
				if (value) this.channelBands[channel] = value
				else delete this.channelBands[channel]
				if (!this.deviceBand) api.updateReceiver('RF_BAND', [...new Set(Object.values(this.channelBands))].join(', '))
				break
			case 'antenna':
				api.updateChannel(channel, 'ANTENNA_CONFIGURATION', value)
				break
			case 'talk':
				api.updateTalkRouting(channel, value)
				break
			// the ACN transmitter bank stands in only while the control port is not giving these
			case 'txModel':
				if (!this.commandsLive) api.updateChannel(channel, 'TX_MODEL', value ?? 'UNKNOWN')
				break
			case 'txBattery':
				if (!this.commandsLive) {
					api.updateChannel(channel, 'TX_BATT_CHARGE_PERCENT', value == null ? '255' : String(value))
					// the bank has no bar count: the five-bar gauge is approximated from the percentage
					api.updateChannel(channel, 'TX_BATT_BARS', value == null ? '255' : String(Math.min(5, Math.ceil(value / 20))))
				}
				break
		}
	}

	#reportStatus() {
		if (this.closed || !this.unit?.connected) return
		if (this.commandsLive) this.ctx.status('ok')
		else
			this.ctx.status(
				'unknown_warning',
				`Connected; command port ${this.commandPort} unavailable, so transmitter, ShowLink and quality details are missing`
			)
	}

	// --- the command-strings side -------------------------------------------------------------

	/** Run one exchange with the control port; exchanges never overlap. */
	#cmd(fn) {
		const run = this.cmdChain.then(() => {
			const client = this.commands
			if (!client?.connected) throw new Error('the control port is not connected')
			return fn(client)
		})
		this.cmdChain = run.catch(() => {})
		return run
	}

	async #openCommands() {
		if (this.closed || this.commands) return
		const client = new CommandClient({ host: this.host, port: this.commandPort, log: (l, m) => this.log(l, m) })
		try {
			await client.connect()
		} catch (err) {
			this.log('info', `control port ${this.commandPort} unavailable (${err.message}); retrying`)
			this.#reportStatus()
			this.#retryCommands()
			return
		}
		if (this.closed) {
			await client.close()
			return
		}
		client.socket?.setKeepAlive(true, 10_000)
		this.commands = client
		this.commandRetryMs = null
		client.on('rep', (rep) => this.#onReport(rep))
		client.on('lost', (err) => {
			if (this.closed || this.commands !== client) return
			this.commands = null
			this.commandsLive = false
			this.cmdChain = Promise.resolve()
			this.log('info', `the control port dropped (${err.message})`)
			this.#reportStatus()
			this.#retryCommands()
		})
		this.commandsLive = true
		this.#reportStatus()
		try {
			await this.#cmd((c) => this.#readCommands(c))
		} catch (err) {
			this.log('warn', `the control-port read did not complete (${err.message})`)
		}
		try {
			await this.#cmd((c) => this.#setMeterRates(c, this.#sampleRate()))
		} catch (err) {
			this.log('warn', `metering did not start (${err.message})`)
		}
	}

	#retryCommands() {
		if (this.closed || this.#standDownUntil()) return
		clearTimeout(this.timers.commandRetry)
		// doubling up to a minute while the port keeps refusing, so the unit is not knocked on every 10 s
		this.commandRetryMs = Math.min(COMMAND_RETRY_MAX_MS, (this.commandRetryMs ?? COMMAND_RETRY_MS / 2) * 2)
		this.timers.commandRetry = setTimeout(() => void this.#openCommands(), this.commandRetryMs)
		this.timers.commandRetry.unref?.()
	}

	/**
	 * The first read of the control port, one property at a time. The reports also arrive as
	 * 'rep' events, which is where they are applied; a property the unit lacks is skipped.
	 */
	async #readCommands(client) {
		const channels = this.channels ?? this.ctx.model.channels
		const tolerant = async (fn) => {
			try {
				return await fn()
			} catch {
				return null
			}
		}
		// the firmware version comes from the ACN session (DEV.FIRMWARE), so FW_VER is not asked here
		// the channels the ANX4 can use now (some are eclipsed by FD-C or Quadversity)
		if (this.licensed) await tolerant(() => client.query(null, 'AVAILABLE_CHANNELS'))
		const channelProps = [
			...TX_PROPS,
			...STATUS_PROPS,
			...EXTRA_CHANNEL_PROPS,
			...(this.licensed ? ANX4_CHANNEL_PROPS : []),
		]
		const showLink = !/^ULX/.test(TRANSMISSION_MODE_TOKEN[this.transmissionMode] ?? '')
		const slotChannels = showLink ? Math.min(channels, this.licensed ? SHOWLINK_MAX_CHANNELS : channels) : 0
		const unbatched = new Set()
		for (let c = 1; c <= channels && !this.closed; c += 1) {
			for (const prop of channelProps) await tolerant(() => client.query(c, prop))
			if (c > slotChannels) continue
			let status = {}
			for (const prop of SLOT_BATCH_PROPS) {
				if (unbatched.has(prop)) continue
				const got = await tolerant(() => client.getSlots(c, prop))
				// a unit that does not answer a `slot 0` read of this property is not asked it again
				if (!got) unbatched.add(prop)
				if (prop === 'SLOT_STATUS' && got) status = got
			}
			const registered = Object.entries(status)
				.filter(([, s]) => s && s !== 'EMPTY')
				.map(([slot]) => Number(slot))
			const detail = [...SLOT_DETAIL_PROPS, ...(this.licensed ? ANX4_SLOT_DETAIL_PROPS : [])]
			for (const slot of registered) {
				for (const prop of detail) await tolerant(() => client.query(c, prop, slot))
			}
		}
	}

	async #setMeterRates(client, ms) {
		const channels = this.channels ?? this.ctx.model.channels
		for (let c = 1; c <= channels; c += 1) await client.setMeterRate(c, ms)
	}

	/** A report from the control port: an answer, or a change the unit made on its own. */
	#onReport(rep) {
		if (this.closed || rep.prop === 'ERR') return
		if (rep.prop === 'SAMPLE') {
			if (rep.line && rep.channel != null) {
				this.api.parseADSample(rep.channel, rep.line, { acnLevels: !!this.unit?.connected })
				this.ctx.checkFeedbacks('sample')
			}
			return
		}
		const value = rep.args.join(' ')
		if (rep.channel == null) this.api.updateReceiver(rep.prop, value)
		else if (rep.prop.startsWith('SLOT_')) {
			const slot = Number(rep.args[0])
			if (slot >= 1) this.api.updateSlot(rep.channel, slot, rep.prop, rep.args.slice(1).join(' '))
		} else this.api.updateChannel(rep.channel, rep.prop, value)
	}

	async #closeCommands() {
		clearTimeout(this.timers.commandRetry)
		const client = this.commands
		this.commands = null
		this.commandsLive = false
		if (!client) return
		if (client.connected) {
			// the unit keeps streaming SAMPLE lines to a client until its rate goes back to 0
			const channels = this.channels ?? this.ctx.model.channels
			const off = (async () => {
				for (let c = 1; c <= channels; c += 1) await client.setMeterRate(c, 0).catch(() => {})
			})()
			await Promise.race([off, delay(CLOSE_DEADLINE_MS)])
		}
		await Promise.race([client.close(), delay(1000)])
		client.socket?.destroy()
	}

	// --- actions ------------------------------------------------------------------------------

	/** Channels an action addresses: `0` is every channel. */
	#targets(channel) {
		const n = this.channels ?? this.ctx.model.channels
		const c = Number(channel)
		if (c === 0) return Array.from({ length: n }, (_, i) => i + 1)
		return Number.isInteger(c) && c >= 1 && c <= n ? [c] : []
	}

	/** An action whose value cannot be sent: logged, and nothing goes to the unit. */
	#refuse(message) {
		this.log('warn', message)
		return Promise.resolve()
	}

	/** One ACN write at a time, as the reference does: the unit's receive buffer is small. */
	#write(label, fn) {
		const run = this.writes.then(async () => {
			const unit = this.unit
			if (!unit?.connected) {
				this.log('warn', `${label}: not connected`)
				return
			}
			try {
				await fn(unit)
			} catch (err) {
				if (err instanceof WriteRefused) {
					this.log('warn', `${label}: the unit refused it (reason ${err.reason})`)
					// the unit is the truth: show what it still holds
					await this.#refresh().catch(() => {})
				} else this.log('warn', `${label}: ${err.message}`)
			}
		})
		this.writes = run.catch(() => {})
		return run
	}

	setGain(channel, db) {
		if (!Number.isFinite(Number(db))) return this.#refuse(`gain ${db}: not a number`)
		const value = clamp(Math.round(Number(db)), GAIN_MIN_DB, GAIN_MAX_DB)
		return this.#write(`gain ${value} dB`, async (unit) => {
			for (const c of this.#targets(channel)) await unit.setChannel(c, 'gainDb', value)
		})
	}

	stepGain(channel, stepDb) {
		if (!Number.isFinite(Number(stepDb))) return this.#refuse(`gain step ${stepDb}: not a number`)
		return this.#write(`gain step ${stepDb} dB`, async (unit) => {
			for (const c of this.#targets(channel)) {
				const now = this.api.getChannel(c).audioGain
				await unit.setChannel(c, 'gainDb', clamp(Math.round(now + Number(stepDb)), GAIN_MIN_DB, GAIN_MAX_DB))
			}
		})
	}

	/** `choice` is ON, OFF or TOGGLE. */
	setMute(channel, choice) {
		return this.#write(`mute ${choice}`, async (unit) => {
			for (const c of this.#targets(channel)) {
				const on = choice === 'TOGGLE' ? this.api.getChannel(c).audioMute !== 'ON' : choice === 'ON'
				await unit.setChannel(c, 'muted', on)
			}
		})
	}

	setChannelName(channel, name) {
		const text = String(name)
		if (!isPrintable(text)) {
			this.log('warn', 'channel name: printable ASCII only')
			return Promise.resolve()
		}
		// the unit holds eight characters; a longer name is cut, not refused
		const value = text.slice(0, CHANNEL_NAME_MAX)
		return this.#write(`channel name "${value}"`, async (unit) => {
			for (const c of this.#targets(channel)) await unit.setChannel(c, 'name', value)
		})
	}

	setDeviceName(name) {
		const text = String(name)
		if (!isPrintable(text)) {
			this.log('warn', 'device name: printable ASCII only')
			return Promise.resolve()
		}
		const value = text.slice(0, DEVICE_NAME_MAX)
		return this.#write(`device name "${value}"`, (unit) => unit.setDevice('name', value))
	}

	/** `mhz` is clamped to the unit's range and snapped to its 25 kHz raster. */
	setFrequency(channel, mhz) {
		if (!Number.isFinite(Number(mhz))) return this.#refuse(`frequency ${mhz}: not a number`)
		const value = khzToMhz(quantizeKhz(clampKhz(mhzToKhz(Number(mhz)))))
		return this.#write(`frequency ${value} MHz`, async (unit) => {
			for (const c of this.#targets(channel)) await unit.setChannel(c, 'frequencyMhz', value)
		})
	}

	/** ANX4: the antenna pair a channel listens on. AUTOMATIC and QUADVERSITY are not writable. */
	setAntenna(channel, pair) {
		if (!this.licensed) {
			this.log('warn', 'antenna configuration is an ANX4 setting')
			return Promise.resolve()
		}
		if (!ANTENNA_SELECTIONS.includes(pair)) {
			this.log(
				'warn',
				`antenna configuration ${pair} cannot be set over the network; choose ${ANTENNA_SELECTIONS.join(' or ')}`
			)
			return Promise.resolve()
		}
		return this.#write(`antenna ${pair}`, async (unit) => {
			for (const c of this.#targets(channel)) {
				const held = await unit.setAntenna(c, pair)
				if (held) this.api.updateChannel(c, 'ANTENNA_CONFIGURATION', held)
			}
		})
	}

	/**
	 * Talk-switch routing: whether one output (XLR, TRS, AES3, Dante) carries the channel in one
	 * switch position. `outputId` is the driver's id (`xlrNormal`, `dantePressed`, ...) and `choice`
	 * is ON, OFF or TOGGLE. The eight routings share a byte, which the driver reads before changing
	 * only the one bit; the result is read back from the unit.
	 */
	setTalkRouting(channel, outputId, choice) {
		if (!TALK_OUTPUTS.some((o) => o.id === outputId)) return this.#refuse(`talk routing: unknown output ${outputId}`)
		return this.#write(`talk routing ${outputId} ${choice}`, async (unit) => {
			for (const c of this.#targets(channel)) {
				const current = this.api.getChannel(c).talk?.[outputId]
				const on = choice === 'TOGGLE' ? current !== true : choice === 'ON'
				await unit.setTalkOutput(c, outputId, on)
			}
		})
	}

	/** Flash the unit's display, or one channel's, from the control port. */
	identify(channel = null) {
		return this.#cmd((client) => client.identify(channel == null ? null : Number(channel))).catch((err) =>
			this.log('warn', `flash: ${err.message}`)
		)
	}

	/**
	 * A command-strings line as the actions build it (`SET 1 SLOT_RF_OUTPUT 3 RF_MUTE`), sent on the
	 * control port. Only SETs go out this way; reads are the backend's own.
	 */
	sendLine(cmd) {
		const m = /^SET\s+(?:(\d{1,2})\s+)?([A-Z0-9_]+)(?:\s+(.*))?$/.exec(String(cmd).trim())
		if (!m) {
			this.log('warn', `not sent (not a SET): ${cmd}`)
			return Promise.resolve()
		}
		const [, channel, prop, rest] = m
		return this.command(channel === undefined ? null : Number(channel), prop, rest === undefined ? [] : [rest])
	}

	/**
	 * A documented control-port SET, for what the ACN driver does not cover (ShowLink slots, group
	 * and channel). `channel` 0 sends it to every channel in turn.
	 */
	command(channel, prop, args = []) {
		let targets = channel == null ? [null] : this.#targets(channel)
		// ShowLink slots exist only on an ANX4's Axient Digital channels
		if (prop.startsWith('SLOT_') && this.licensed && Number(channel) === 0)
			targets = targets.filter((c) => c <= SHOWLINK_MAX_CHANNELS)
		return this.#cmd(async (client) => {
			for (const c of targets) {
				try {
					await client.set(c, prop, args.map(String))
				} catch (err) {
					this.log('warn', `${prop}${c == null ? '' : ` on channel ${c}`}: ${err.message}`)
				}
			}
		}).catch((err) => this.log('warn', `${prop}: ${err.message}`))
	}
}

/** For tests: forget recorded session losses. */
export function resetLosses() {
	losses.clear()
}

/** For tests: forget the shared SLP browse. */
export function stopSharedBrowser() {
	sharedBrowser?.stop()
	sharedBrowser = null
}

export { MAX_CHANNELS, modelOf }
