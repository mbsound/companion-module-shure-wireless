import {
	CreateConvertToBooleanFeedbackUpgradeScript,
	InstanceBase,
	InstanceStatus,
	Regex,
	runEntrypoint,
} from '@companion-module/base'
import { updateActions } from './actions.js'
import { updateFeedbacks } from './feedback.js'
import { updateVariables } from './variables.js'
import WirelessApi from './internalAPI.js'
import { BooleanFeedbackUpgradeMap } from './upgrades.js'
import { Choices, Models } from './setup.js'
import { AxientBackend, stopSharedBrowser } from './backends/axient.js'
import { LegacyBackend } from './backends/legacy.js'

/** Rebuild action/feedback definitions at most this often while names are streaming in. */
const DEFINITIONS_DEBOUNCE = 250

/**
 * Companion instance for Shure wireless receivers and transmitters.
 *
 * AD4D, AD4Q and ANX4 run on the ACN + command-strings driver from soundbase-plugin-shure-axient-digital
 * (`backends/axient.js`); every other model runs on the command strings alone (`backends/legacy.js`).
 * Both feed the same state store, so variables, feedbacks and icons are shared.
 *
 * @extends InstanceBase
 * @author Joseph Adams <josephdadams@gmail.com>
 * @author Keith Rocheck <keith.rocheck@gmail.com>
 */
class ShureWirelessInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		this.updateActions = updateActions.bind(this)
		this.updateFeedbacks = updateFeedbacks.bind(this)
		this.updateVariables = updateVariables.bind(this)
		this.backend = null
		this.definitionsTimer = undefined
		this.pendingVariables = {}
		this.pendingFeedbacks = new Set()
	}

	get isAxient() {
		return this.model?.family === 'ad'
	}

	async init(config) {
		this.config = config
		this.model = {}

		this.CHOICES_CHANNELS = []
		this.CHOICES_CHANNELS_A = []
		this.CHOICES_SLOTS = []
		this.CHOICES_SLOTS_A = []

		if (Models[this.config.modelID] === undefined) {
			if (this.config.modelID !== undefined) {
				this.log('warn', `Shure Model: ${this.config.modelID} NOT FOUND, using ULXD4`)
			}
			this.config.modelID = 'ulxd4'
		}
		this.model = { ...Models[this.config.modelID] }

		if (this.config.variableFormat === undefined) {
			this.config.variableFormat = 'units'
		}

		this.updateStatus(InstanceStatus.Connecting)

		this.api = new WirelessApi(this)

		this.setupFields()

		this.updateActions()
		this.updateVariables()
		this.updateFeedbacks()

		this.#startBackend()
	}

	async configUpdated(config) {
		const reconnect =
			this.config.host !== config.host ||
			String(this.config.port) !== String(config.port) ||
			this.config.modelID !== config.modelID ||
			String(this.config.networkInterface ?? '').trim() !== String(config.networkInterface ?? '').trim()
		const metering =
			this.config.meteringOn !== config.meteringOn ||
			Number(this.config.meteringInterval) !== Number(config.meteringInterval)

		// a stored ACN component id belongs to the unit at the old address
		if (this.config.host !== config.host) delete config.acnCid
		else if (config.acnCid === undefined && this.config.acnCid !== undefined) config.acnCid = this.config.acnCid

		this.config = config

		if (Models[this.config.modelID] !== undefined) {
			this.model = { ...Models[this.config.modelID] }
		} else {
			this.log('warn', `Shure Model: ${this.config.modelID} NOT FOUND`)
		}

		if (reconnect) {
			this.api = new WirelessApi(this)
		}

		this.updateActions()
		this.updateFeedbacks()
		this.updateVariables()

		if (reconnect || !this.backend) {
			await this.#stopBackend()
			this.#startBackend()
		} else if (metering) {
			this.backend.applyMetering(config)
		}
	}

	async destroy() {
		this.destroyed = true
		clearTimeout(this.definitionsTimer)
		this.definitionsTimer = undefined
		await this.#stopBackend()
		stopSharedBrowser()
		this.log('debug', `destroy ${this.id}`)
	}

	#startBackend() {
		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Set the target IP')
			return
		}
		const ctx = {
			api: this.api,
			model: this.model,
			config: { ...this.config },
			log: (level, message) => this.log(level, message),
			status: (status, message) => this.updateStatus(status, message ?? null),
			checkFeedbacks: (...ids) => this.checkFeedbacks(...ids),
		}
		if (this.isAxient) {
			this.backend = new AxientBackend({
				...ctx,
				saveCid: (cid) => this.#saveCid(cid),
				channelCount: (n) => this.#setChannelCount(n),
			})
		} else {
			this.backend = new LegacyBackend(ctx)
		}
		this.backend.start()
	}

	async #stopBackend() {
		const backend = this.backend
		this.backend = null
		await backend?.stop()
	}

	/** Keep the unit's ACN component id, so a reconnect does not have to discover it again. */
	#saveCid(cid) {
		if ((this.config.acnCid ?? null) === (cid ?? null)) return
		if (cid) this.config.acnCid = cid
		else delete this.config.acnCid
		this.saveConfig(this.config)
	}

	/** An ANX4 has the channels it is licensed for: rebuild everything for that count. */
	#setChannelCount(n) {
		if (this.model.channels === n) return
		this.model.channels = n
		this.updateVariables()
		this.scheduleDefinitionsUpdate()
	}

	/**
	 * Rebuild the action and feedback definitions (their dropdowns show channel names and
	 * transmitter IDs), coalescing bursts of name reports.
	 */
	scheduleDefinitionsUpdate() {
		if (this.definitionsTimer !== undefined) return
		this.definitionsTimer = setTimeout(() => {
			this.definitionsTimer = undefined
			this.updateActions()
			this.updateFeedbacks()
		}, DEFINITIONS_DEBOUNCE)
	}

	/**
	 * The state store asks for the channel and slot queries that follow an ANX4's mode and
	 * channel reports. On AD4D/AD4Q/ANX4 the Axient backend's own read covers them (and a mode
	 * change restarts the unit, which is read again in full), and no other model sends them.
	 */
	querySupplemental() {}

	/**
	 * Collects variable changes and sends them to Companion once per event loop turn,
	 * instead of one message per property reported by the receiver.
	 */
	setVariableValues(values) {
		Object.assign(this.pendingVariables, values)
		this.scheduleFlush()
	}

	/** Collects feedback checks, so each type is evaluated once per event loop turn. */
	checkFeedbacks(...feedbackTypes) {
		if (feedbackTypes.length == 0) {
			super.checkFeedbacks()
			return
		}
		for (let type of feedbackTypes) this.pendingFeedbacks.add(type)
		this.scheduleFlush()
	}

	scheduleFlush() {
		if (this.flushScheduled !== true) {
			this.flushScheduled = true
			setImmediate(() => this.flush())
		}
	}

	flush() {
		this.flushScheduled = false
		if (this.destroyed === true) return
		let variables = this.pendingVariables
		this.pendingVariables = {}
		if (Object.keys(variables).length > 0) super.setVariableValues(variables)
		if (this.pendingFeedbacks.size > 0) {
			let feedbacks = [...this.pendingFeedbacks]
			this.pendingFeedbacks.clear()
			super.checkFeedbacks(...feedbacks)
		}
	}

	/**
	 * Send a command-strings command (without brackets). On AD4D/AD4Q/ANX4 it goes out on the
	 * Axient backend's control port, one request at a time; the settings ACN covers do not
	 * come through here.
	 */
	sendCommand(cmd) {
		if (cmd === undefined) return
		if (this.backend instanceof LegacyBackend) this.backend.send(cmd)
		else if (this.backend instanceof AxientBackend) this.backend.sendLine(cmd)
		else this.log('debug', `not sent (not connected): ${cmd}`)
	}

	/**
	 *
	 * @param {object} event - action event
	 * @param {string} option - which event option to parse
	 * @param {object} context 	- contains variable parser function
	 * @param {object} [validate] - optional regexp or range to compare against result
	 * @returns result of parsing variables in event.options[option] or null if regex or range fails
	 * @access private
	 * @since 2.1.0
	 */
	async parseActionOption(event, option, context, validate) {
		// options can hold a number (untouched numeric default) or be missing entirely
		let value = String(await context.parseVariablesInString(String(event.options[option] ?? ''))).trim()
		let err = null

		let regex = null
		let range = null

		if (validate instanceof RegExp) {
			regex = validate
		} else if (typeof validate === 'string') {
			let match = validate.match(/^\/(.*)\/([dgimsuy]*)$/)
			regex = match ? new RegExp(match[1], match[2]) : new RegExp(validate)
		} else if (validate && typeof validate === 'object') {
			if (validate.range) {
				range = validate.range
			}
			if (validate.regex instanceof RegExp) {
				regex = validate.regex
			} else if (typeof validate.regex === 'string') {
				let match = validate.regex.match(/^\/(.*)\/([dgimsuy]*)$/)
				regex = match ? new RegExp(match[1], match[2]) : new RegExp(validate.regex)
			}
		}

		if (regex && !regex.test(value)) {
			err = 'Invalid value'
		} else if (range) {
			if (!/^[+-]?\d+$/.test(value)) {
				err = 'Not a number'
			} else {
				value = parseInt(value)
				if (value < range.min || value > range.max) {
					err = 'Out of range'
				}
			}
		}

		if (err) {
			this.log('warn', `${[event.controlId, event.actionId, option].join(' → ')}: ${err} ("${value}"), nothing sent`)
			return null
		}

		return value
	}

	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				width: 6,
				regex: Regex.IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Command Strings Port',
				default: 2202,
				width: 2,
				regex: Regex.PORT,
			},
			{
				type: 'dropdown',
				id: 'modelID',
				label: 'Model Type',
				choices: Choices.Models,
				width: 6,
				default: 'ulxd4',
			},
			{
				type: 'static-text',
				id: 'axientInfo',
				label: 'AD4D, AD4Q and ANX4',
				width: 12,
				value:
					'These receivers are controlled over ACN, the protocol Wireless Workbench uses, so Companion must be on the ' +
					"receiver's network segment (discovery on UDP 8427). Transmitter, ShowLink and quality details come from " +
					'the command strings port, which must be enabled on the receiver; without it everything else still works.',
				isVisible: (options) => ['ad4d', 'ad4q', 'anx4'].includes(options.modelID),
			},
			{
				type: 'textinput',
				id: 'networkInterface',
				label: 'Network adapter (optional)',
				tooltip:
					'The adapter to reach the receiver through, by name (en0, Ethernet) or by its IPv4 address. Use it when ' +
					"more than one of this computer's adapters is on the receiver's subnet, such as Wi-Fi and wired on a wide " +
					'subnet. Blank chooses by subnet.',
				width: 6,
				default: '',
				isVisible: (options) => ['ad4d', 'ad4q', 'anx4'].includes(options.modelID),
			},
			{
				type: 'checkbox',
				id: 'meteringOn',
				label: 'Enable Metering?',
				width: 2,
				default: true,
			},
			{
				type: 'number',
				id: 'meteringInterval',
				label: 'Metering Interval (in ms)',
				tooltip: 'How often meter values are updated, 100 ms or slower. Faster rates load Companion and the receiver.',
				width: 4,
				min: 100,
				max: 99999,
				default: 5000,
				required: true,
			},
			{
				type: 'dropdown',
				id: 'variableFormat',
				label: 'Variable Format',
				choices: [
					{ id: 'units', label: 'Include Units' },
					{ id: 'numeric', label: 'Numeric Only' },
				],
				width: 6,
				default: 'units',
				tooltip:
					'Changing this setting will apply to new values received.  To refresh all variables with the new setting, disable and re-enable the connection after saving these settings.',
			},
		]
	}

	/** Channel and slot choices for actions and feedbacks, from the model and the names heard so far. */
	setupChannelChoices() {
		this.CHOICES_CHANNELS = []
		this.CHOICES_CHANNELS_A = []
		this.CHOICES_SLOTS = []
		this.CHOICES_SLOTS_A = []

		if (this.model.channels > 1) {
			this.CHOICES_CHANNELS_A.push({ id: '0', label: 'All Channels' })
		}

		if (this.model.slots > 0) {
			this.CHOICES_SLOTS_A.push({ id: '0:0', label: 'All Channels & Slots' })
		}

		let maxSlotChannels = this.model.id == 'anx4' ? Math.min(16, this.model.channels) : this.model.channels

		for (let i = 1; i <= this.model.channels; i++) {
			let data = `Channel ${i}`

			if (this.api.getChannel(i).name != '') {
				data += ' (' + this.api.getChannel(i).name + ')'
			}

			this.CHOICES_CHANNELS.push({ id: i, label: data })
			this.CHOICES_CHANNELS_A.push({ id: i, label: data })

			if (this.model.slots > 0 && i <= maxSlotChannels) {
				this.CHOICES_SLOTS_A.push({ id: `${i}:0`, label: `${data}, All Slots` })

				for (let j = 1; j <= this.model.slots; j++) {
					let id = `${i}:${j}`
					data = id

					if (this.api.getSlot(i, j).txDeviceId != '') {
						data += ` (${this.api.getSlot(i, j).txDeviceId})`
					}

					this.CHOICES_SLOTS.push({ id: id, label: data })
					this.CHOICES_SLOTS_A.push({ id: id, label: data })
				}
			}
		}

		this.CHANNELS_FIELD.choices = this.CHOICES_CHANNELS
		this.CHANNELS_A_FIELD.choices = this.CHOICES_CHANNELS_A
		this.SLOTS_FIELD.choices = this.CHOICES_SLOTS
		this.SLOTS_A_FIELD.choices = this.CHOICES_SLOTS_A
	}

	/** The fields used in actions and feedbacks. */
	setupFields() {
		this.CHANNELS_FIELD = {
			type: 'dropdown',
			label: 'Channel',
			id: 'channel',
			default: '1',
			choices: this.CHOICES_CHANNELS,
		}
		this.CHANNELS_A_FIELD = {
			type: 'dropdown',
			label: 'Channel',
			id: 'channel',
			default: '1',
			choices: this.CHOICES_CHANNELS_A,
		}
		this.SLOTS_FIELD = {
			type: 'dropdown',
			label: 'Slot Number',
			id: 'slot',
			default: '1:1',
			choices: this.CHOICES_SLOTS,
		}
		this.SLOTS_A_FIELD = {
			type: 'dropdown',
			label: 'Slot Number',
			id: 'slot',
			default: '1:1',
			choices: this.CHOICES_SLOTS_A,
		}
	}
}

runEntrypoint(ShureWirelessInstance, [CreateConvertToBooleanFeedbackUpgradeScript(BooleanFeedbackUpgradeMap)])
