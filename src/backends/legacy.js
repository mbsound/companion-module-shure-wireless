// ULX-D, QLX-D, SLX-D, SLX-D+ and PSM1000 over Shure's documented TCP 2202 command strings.
// The protocol handling is the module's long-standing logic (internalAPI.js); what changed here is
// the connection discipline: commands go out paced from one queue, the heartbeat is a single timer
// that cannot multiply across reconnects, and metering is switched off when the connection closes.

import { TCPHelper } from '@companion-module/base'

/** Gap between commands sent to the unit, as the reference driver paces its sends. */
const SEND_GAP_MS = 25
const HEARTBEAT_MS = 30_000
/** No data at all for this long (two missed heartbeats and change) means the link is dead. */
const SILENCE_MS = 75_000
const CLOSE_DEADLINE_MS = 1500

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class LegacyBackend {
	/**
	 * @param {{
	 *   api: import('../internalAPI.js').default,
	 *   model: { id: string, family: string, channels: number },
	 *   config: { host: string, port?: number|string, meteringOn?: boolean, meteringInterval?: number },
	 *   log: (level: string, message: string) => void,
	 *   status: (status: string, message?: string) => void,
	 *   checkFeedbacks: (...ids: string[]) => void,
	 *   timings?: { sendGapMs?: number, heartbeatMs?: number, silenceMs?: number },
	 * }} ctx  `timings` is for tests
	 */
	constructor(ctx) {
		this.ctx = ctx
		this.timings = { sendGapMs: SEND_GAP_MS, heartbeatMs: HEARTBEAT_MS, silenceMs: SILENCE_MS, ...ctx.timings }
		this.api = ctx.api
		this.socket = null
		this.buffer = ''
		this.queue = []
		this.pumping = false
		this.lastDataAt = 0
		this.heartbeat = null
		this.closed = false
	}

	get #family() {
		return this.ctx.model.family
	}

	start() {
		this.#open()
	}

	#open() {
		const host = String(this.ctx.config.host ?? '').trim()
		if (!host || this.closed) return
		const socket = new TCPHelper(host, Number(this.ctx.config.port) || 2202)
		this.socket = socket
		this.buffer = ''
		socket.on('status_change', (status, message) => this.ctx.status(status, message))
		socket.on('error', (err) => this.ctx.log('error', `Network error: ${err.message}`))
		socket.on('connect', () => {
			if (socket !== this.socket) return
			this.ctx.log('debug', 'Connected')
			this.lastDataAt = Date.now()
			this.queue = []
			for (const cmd of this.#initialCommands()) this.send(cmd)
			this.#startHeartbeat()
		})
		socket.on('end', () => this.#stopHeartbeat())
		socket.on('data', (chunk) => {
			if (socket !== this.socket) return
			this.lastDataAt = Date.now()
			this.buffer += chunk.toString('latin1')
			for (;;) {
				const start = this.buffer.indexOf('<')
				if (start < 0) {
					this.buffer = ''
					break
				}
				const end = this.buffer.indexOf('>', start)
				if (end < 0) {
					this.buffer = this.buffer.slice(start)
					break
				}
				const frame = this.buffer.slice(start + 1, end).trim()
				this.buffer = this.buffer.slice(end + 1)
				this.processShureCommand(frame)
			}
		})
	}

	/** What the unit is asked for after every connect, in order. */
	#initialCommands() {
		const out = []
		const channels = this.ctx.model.channels
		if (this.#family === 'psm') {
			out.push('GET DEVICE_NAME')
			for (let i = 1; i <= channels; i++) {
				for (const prop of [
					'CHAN_NAME',
					'AUDIO_IN_LVL',
					'GROUP_CHAN',
					'FREQUENCY',
					'RF_TX_LVL',
					'RF_MUTE',
					'AUDIO_TX_MODE',
					'AUDIO_IN_LINE_LVL',
				]) {
					out.push(`GET ${i} ${prop}`)
				}
			}
		} else {
			out.push('GET 0 ALL')
			if (this.#family === 'ulx') {
				out.push('GET SCAN_LOCK', 'GET SYNC_LOCK', 'GET NA_DEVICE_NAME')
				for (let i = 1; i <= channels; i++) out.push(`GET ${i} NA_CHAN_NAME`, `GET ${i} TX_FW_VER`)
			}
			if (this.#family === 'slxplus') {
				out.push('GET NA_DEVICE_NAME', 'GET APP_CONN_ENABLED')
				for (let i = 1; i <= channels; i++) {
					out.push(
						`GET ${i} LINK_STATUS`,
						`GET ${i} LINK_TX_MODEL`,
						`GET ${i} LINK_TX_BATT_MINS`,
						`GET ${i} NA_CHAN_NAME`
					)
				}
			}
		}
		out.push(...this.#meterCommands(this.#meterRate()))
		return out
	}

	#meterRate(config = this.ctx.config) {
		if (config.meteringOn !== true) return 0
		return clamp(Number(config.meteringInterval) || 1000, 100, 65_535)
	}

	#meterCommands(rate) {
		if (this.#family === 'psm') {
			return Array.from({ length: this.ctx.model.channels }, (_, i) => `SET ${i + 1} METER_RATE ${rate}`)
		}
		return [`SET 0 METER_RATE ${rate}`]
	}

	applyMetering(config) {
		const before = this.#meterRate()
		this.ctx.config = { ...this.ctx.config, meteringOn: config.meteringOn, meteringInterval: config.meteringInterval }
		const after = this.#meterRate()
		if (before !== after) for (const cmd of this.#meterCommands(after)) this.send(cmd)
	}

	/** Queue a command (without its brackets) to go out paced. */
	send(cmd) {
		if (cmd === undefined) return
		if (!this.socket?.isConnected) {
			this.ctx.log('debug', 'Socket not connected')
			return
		}
		this.queue.push(`< ${cmd} >`)
		void this.#pump()
	}

	async #pump() {
		if (this.pumping) return
		this.pumping = true
		try {
			while (this.queue.length && this.socket?.isConnected && !this.closed) {
				await this.socket.send(this.queue.shift())
				await delay(this.timings.sendGapMs)
			}
		} catch (err) {
			this.ctx.log('debug', `send failed: ${err.message}`)
		} finally {
			this.pumping = false
		}
	}

	#startHeartbeat() {
		this.#stopHeartbeat()
		this.heartbeat = setInterval(() => {
			if (!this.socket?.isConnected) return
			if (Date.now() - this.lastDataAt > this.timings.silenceMs) {
				this.ctx.log('warn', 'No data from the unit; reconnecting')
				this.#reconnect()
				return
			}
			this.send('GET 1 METER_RATE')
		}, this.timings.heartbeatMs)
		this.heartbeat.unref?.()
	}

	#stopHeartbeat() {
		clearInterval(this.heartbeat)
		this.heartbeat = null
	}

	#reconnect() {
		this.#stopHeartbeat()
		this.queue = []
		this.socket?.destroy()
		this.socket = null
		this.#open()
	}

	async stop() {
		this.closed = true
		this.#stopHeartbeat()
		const socket = this.socket
		this.socket = null
		this.queue = []
		if (socket?.isConnected) {
			// the unit keeps streaming SAMPLE lines until metering is turned off
			const off = (async () => {
				for (const cmd of this.#meterCommands(0)) {
					await socket.send(`< ${cmd} >`)
					await delay(this.timings.sendGapMs)
				}
			})()
			await Promise.race([off.catch(() => {}), delay(CLOSE_DEADLINE_MS)])
		}
		socket?.destroy()
	}

	/**
	 * Route one report from the unit to the state store.
	 *
	 * @param {string} command - the frame without its brackets, e.g. `REP 1 CHAN_NAME {Vox}`
	 */
	processShureCommand(command) {
		if (typeof command !== 'string' || command.length === 0) return
		const commandArr = command.split(' ')
		const commandType = commandArr.shift()
		const commandNum = parseInt(commandArr[0])
		const joinData = (from) => commandArr.slice(from).join(' ').trim()

		if (commandType == 'REP' || commandType == 'REPORT') {
			if (isNaN(commandNum)) {
				this.api.updateReceiver(commandArr[0], joinData(1))
			} else if (commandArr[1] && commandArr[1].startsWith('SLOT')) {
				this.api.updateSlot(commandNum, parseInt(commandArr[2]), commandArr[1], joinData(3))
			} else if (commandArr[1]) {
				this.api.updateChannel(commandNum, commandArr[1], joinData(2))
			}
		} else if (commandType == 'SAMPLE') {
			switch (this.#family) {
				case 'ulx':
				case 'qlx':
					this.api.parseULXSample(commandNum, command)
					break
				case 'slx':
				case 'slxplus':
					this.api.parseSLXSample(commandNum, command)
					break
			}
			this.ctx.checkFeedbacks('sample')
		}
	}
}
