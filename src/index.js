import {
	CreateConvertToBooleanFeedbackUpgradeScript,
	InstanceBase,
	InstanceStatus,
	Regex,
	runEntrypoint,
	TCPHelper,
} from '@companion-module/base'
import { updateActions } from './actions.js'
import { updateFeedbacks } from './feedback.js'
import { updateVariables } from './variables.js'
import WirelessApi from './internalAPI.js'
import { BooleanFeedbackUpgradeMap } from './upgrades.js'
import { Choices, Models } from './setup.js'

// Minimum gap between two commands written to the receiver, so a burst of
// queries is never dumped on the command string parser in one TCP segment.
const SEND_INTERVAL = 20
// Rebuild action/feedback definitions at most this often while names are streaming in.
const DEFINITIONS_DEBOUNCE = 250
const RECEIVE_BUFFER_LIMIT = 65536

/**
 * Companion instance class for the Shure Wireless Microphones.
 *
 * @extends InstanceBase
 * @since 1.0.0
 * @author Joseph Adams <josephdadams@gmail.com>
 * @author Keith Rocheck <keith.rocheck@gmail.com>
 */
class ShureWirelessInstance extends InstanceBase {
	/**
	 * Create an instance of a shure WX module.
	 *
	 * @param {Object} internal - Companion internals
	 * @since 1.0.0
	 */
	constructor(internal) {
		super(internal)

		this.updateActions = updateActions.bind(this)
		this.updateFeedbacks = updateFeedbacks.bind(this)
		this.updateVariables = updateVariables.bind(this)

		this.actionQueue = []
		this.pollQueue = []
		this.pendingVariables = {}
		this.pendingFeedbacks = new Set()
		this.loggedParseErrors = new Set()
	}

	/**
	 * Process an updated configuration array.
	 *
	 * @param {Object} config - the new configuration
	 * @access public
	 * @since 1.0.0
	 */
	async configUpdated(config) {
		const oldConfig = this.config
		this.config = config

		const modelChanged = oldConfig.modelID != config.modelID
		const resetConnection = oldConfig.host != config.host || oldConfig.port != config.port || modelChanged

		if (Models[this.config.modelID] !== undefined) {
			this.model = Models[this.config.modelID]
		} else {
			this.log('warn', `Shure Model: ${this.config.modelID} NOT FOUND`)
		}

		if (modelChanged) {
			// the tracked state is model specific
			this.api = new WirelessApi(this)
		}

		this.updateActions()
		this.updateFeedbacks()
		this.updateVariables()

		if (resetConnection === true || this.socket === undefined) {
			this.initTCP()
		} else if (
			oldConfig.meteringOn !== config.meteringOn ||
			(config.meteringOn === true && oldConfig.meteringInterval != config.meteringInterval)
		) {
			this.sendMeterRate(config.meteringOn === true ? this.getMeterRate() : 0)
		}
	}

	/**
	 * Clean up the instance before it is destroyed.
	 *
	 * @access public
	 * @since 1.0.0
	 */
	async destroy() {
		this.destroyed = true
		this.clearQueue()

		if (this.definitionsTimer !== undefined) {
			clearTimeout(this.definitionsTimer)
			this.definitionsTimer = undefined
		}

		if (this.socket !== undefined) {
			this.socket.destroy()
		}

		if (this.heartbeatInterval !== undefined) {
			clearInterval(this.heartbeatInterval)
		}

		if (this.heartbeatTimeout !== undefined) {
			clearTimeout(this.heartbeatTimeout)
		}

		this.log('debug', 'destroy', this.id)
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

	/**
	 * Creates the configuration fields for web config.
	 *
	 * @returns {Array} the config fields
	 * @access public
	 * @since 1.0.0
	 */
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
				label: 'Target Port',
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
				tooltip: 'If this value is too low (fast)\nthe GUI may lock up.',
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

	/**
	 * Main initialization function called once the module
	 * is OK to start doing things.
	 *
	 * @param {Object} config - the configuration
	 * @access public
	 * @since 1.0.0
	 */
	async init(config) {
		this.config = config
		this.model = {}
		this.deviceName = ''
		this.initDone = false

		this.heartbeatInterval = null
		this.heartbeatTimeout = null

		this.CHOICES_CHANNELS = []
		this.CHOICES_CHANNELS_A = []
		this.CHOICES_SLOTS = []
		this.CHOICES_SLOTS_A = []

		this.model = Models[this.config.modelID]

		if (this.model === undefined) {
			if (this.config.modelID !== undefined) {
				this.log('warn', `Shure Model: ${this.config.modelID} NOT FOUND, using ULXD4`)
			}
			this.config.modelID = 'ulxd4'
			this.model = Models['ulxd4']
		}

		if (this.config.variableFormat === undefined) {
			this.config.variableFormat = 'units'
		}

		this.updateStatus('disconnected', 'Connecting')

		this.api = new WirelessApi(this)

		this.setupFields()

		this.updateActions()
		this.updateVariables()
		this.updateFeedbacks()

		this.initTCP()
	}

	/**
	 * INTERNAL: use setup data to initalize the tcp socket object.
	 *
	 * @access protected
	 * @since 1.0.0
	 */
	initTCP() {
		this.receiveBuffer = ''
		this.clearQueue()

		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.heartbeatInterval !== undefined) {
			clearInterval(this.heartbeatInterval)
		}

		if (this.heartbeatTimeout !== undefined) {
			clearTimeout(this.heartbeatTimeout)
		}

		if (this.config.port === undefined) {
			this.config.port = 2202
		}

		if (this.config.host) {
			this.socket = new TCPHelper(this.config.host, this.config.port)

			this.socket.on('status_change', (status, message) => {
				this.updateStatus(status, message)
			})

			this.socket.on('error', (err) => {
				this.clearQueue()
				this.log('error', `Network error: ${err.message}`)
			})

			this.socket.on('end', () => {
				this.clearQueue()
			})

			this.socket.on('connect', () => {
				this.log('debug', 'Connected')

				this.receiveBuffer = ''
				this.clearQueue()
				this.supplementalQueried = false

				const query = (cmd) => this.queueCommand(cmd, true)

				if (this.model.family == 'psm') {
					query('GET DEVICE_NAME')
					for (let i = 1; i <= this.model.channels; i++) {
						query(`GET ${i} CHAN_NAME`)
						query(`GET ${i} AUDIO_IN_LVL`)
						query(`GET ${i} GROUP_CHAN`)
						query(`GET ${i} FREQUENCY`)
						query(`GET ${i} RF_TX_LVL`)
						query(`GET ${i} RF_MUTE`)
						query(`GET ${i} AUDIO_TX_MODE`)
						query(`GET ${i} AUDIO_IN_LINE_LVL`)
					}
				} else {
					query('GET 0 ALL')

					if (this.model.family == 'ad') {
						if (this.model.id == 'anx4') {
							// The per-channel queries follow in querySupplemental(), once the receiver
							// has reported which channels exist and which transmission mode it is in.
							query('GET NUMBER_CHANNELS_LICENSED')
							query('GET AVAILABLE_CHANNELS')
							query('GET TRANSMISSION_MODE')
						} else {
							this.querySupplemental()
						}
					}

					if (this.model.family == 'ulx') {
						query('GET SCAN_LOCK')
						query('GET SYNC_LOCK')
						query('GET NA_DEVICE_NAME')
						for (let i = 1; i <= this.model.channels; i++) {
							query(`GET ${i} NA_CHAN_NAME`)
							query(`GET ${i} TX_FW_VER`)
						}
					}

					if (this.model.family == 'slxplus') {
						query('GET NA_DEVICE_NAME')
						query('GET APP_CONN_ENABLED')
						for (let i = 1; i <= this.model.channels; i++) {
							query(`GET ${i} LINK_STATUS`)
							query(`GET ${i} LINK_TX_MODEL`)
							query(`GET ${i} LINK_TX_BATT_MINS`)
							query(`GET ${i} NA_CHAN_NAME`)
						}
					}
				}

				if (this.config.meteringOn === true) {
					this.sendMeterRate(this.getMeterRate())
				}

				// the helper reconnects on its own, so this handler runs once per (re)connect
				if (this.heartbeatInterval !== undefined) {
					clearInterval(this.heartbeatInterval)
				}

				this.heartbeatInterval = setInterval(() => {
					this.safeSend('< GET 1 METER_RATE >')
				}, 30000)
			})

			// separate buffered stream into lines with responses
			this.socket.on('data', (chunk) => {
				let i = 0,
					offset = 0
				this.receiveBuffer += chunk

				while ((i = this.receiveBuffer.indexOf('>', offset)) !== -1) {
					this.processLine(this.receiveBuffer.substring(offset, i))
					offset = i + 1
				}

				this.receiveBuffer = this.receiveBuffer.substring(offset)

				if (this.receiveBuffer.length > RECEIVE_BUFFER_LIMIT) {
					// not a command string stream
					this.receiveBuffer = ''
				}
			})
		}
	}

	/**
	 * INTERNAL: handle one received command string.
	 * A line this module cannot parse must never take the connection down.
	 *
	 * @param {string} line - the received string, without the closing '>'
	 * @access protected
	 * @since 2.3.2
	 */
	processLine(line) {
		try {
			this.processShureCommand(line.replace(/^[\s<]+/, '').trim())
		} catch (e) {
			let message = `Unable to parse "${line.trim()} >": ${e.message}`
			if (!this.loggedParseErrors.has(e.message) && this.loggedParseErrors.size < 50) {
				this.loggedParseErrors.add(e.message)
				this.log('warn', message)
			}
		}

		if (line.includes('METER_RATE')) {
			if (this.heartbeatTimeout !== undefined) {
				clearTimeout(this.heartbeatTimeout)
			}

			this.heartbeatTimeout = setTimeout(this.initTCP.bind(this), 60000)
		}
	}

	/**
	 * INTERNAL: ask for the properties GET 0 ALL may not have covered.
	 * Uses slot 0 (all slots of a channel) to keep the number of commands down,
	 * and on ANX4 only asks about channels and features the receiver reports having.
	 *
	 * @access protected
	 * @since 2.3.2
	 */
	querySupplemental() {
		if (this.model.family != 'ad' || this.supplementalQueried === true) {
			return
		}

		let channels = []
		let slots = this.model.slots > 0
		// ANX4 is 16 channels in Axient Digital mode and 24 in ULX-D mode
		let maxSlotChannels = this.model.id == 'anx4' ? 16 : this.model.channels

		if (this.model.id == 'anx4') {
			let receiver = this.api.getReceiver()

			if (receiver.availableChannelList === undefined || receiver.transmissionMode == '') {
				return
			}

			channels = receiver.availableChannelList.filter((ch) => ch >= 1 && ch <= this.model.channels)
			// transmitter slots only exist on Axient Digital channels
			slots = slots && receiver.transmissionMode.startsWith('AD')
		} else {
			for (let i = 1; i <= this.model.channels; i++) {
				channels.push(i)
			}
		}

		this.supplementalQueried = true

		for (let ch of channels) {
			if (this.model.id == 'anx4') {
				this.queueCommand(`GET ${ch} ANTENNA_CONFIGURATION`, true)
				this.queueCommand(`GET ${ch} TX_PHANTOM_POWER`, true)
				this.queueCommand(`GET ${ch} TX_HIGH_PASS_FILTER`, true)
			}
			if (slots && ch <= maxSlotChannels) {
				// slot 0 addresses all 8 slots of the channel
				this.queueCommand(`GET ${ch} SLOT_STATUS 0`, true)
				this.queueCommand(`GET ${ch} SLOT_RF_OUTPUT 0`, true)
				if (this.model.id == 'anx4') {
					this.queueCommand(`GET ${ch} SLOT_PHANTOM_POWER 0`, true)
					this.queueCommand(`GET ${ch} SLOT_HIGH_PASS_FILTER 0`, true)
				}
			}
		}
	}

	/**
	 * INTERNAL: the configured metering interval, limited to what the receiver accepts.
	 *
	 * @returns {number} the interval in ms
	 * @access protected
	 * @since 2.3.2
	 */
	getMeterRate() {
		let rate = parseInt(this.config.meteringInterval)
		let max = this.model.family == 'ad' ? 65535 : 99999

		if (isNaN(rate)) {
			rate = 5000
		}

		return Math.min(max, Math.max(100, rate))
	}

	/**
	 * INTERNAL: set the meter rate on the receiver.
	 *
	 * @param {number} rate - the interval in ms, 0 to turn metering off
	 * @access protected
	 * @since 2.3.2
	 */
	sendMeterRate(rate) {
		if (this.model.family == 'psm') {
			for (let i = 1; i <= this.model.channels; i++) {
				this.queueCommand(`SET ${i} METER_RATE ${rate}`, true)
			}
		} else {
			this.queueCommand(`SET 0 METER_RATE ${rate}`, true)
		}
	}

	/**
	 * INTERNAL: queue a command for the receiver. Commands leave one at a time,
	 * SEND_INTERVAL apart; commands from actions go ahead of background queries.
	 *
	 * @param {string} cmd - the command, without the enclosing < >
	 * @param {boolean} [poll] - true for background queries
	 * @access protected
	 * @since 2.3.2
	 */
	queueCommand(cmd, poll = false) {
		if (poll) {
			this.pollQueue.push(`< ${cmd} >`)
		} else {
			this.actionQueue.push(`< ${cmd} >`)
		}

		if (this.sendTimer === undefined) {
			this.sendNextCommand()
			this.sendTimer = setInterval(() => this.sendNextCommand(), SEND_INTERVAL)
		}
	}

	/**
	 * INTERNAL: write the next queued command, or stop the queue timer when done.
	 *
	 * @access protected
	 * @since 2.3.2
	 */
	sendNextCommand() {
		let msg = this.actionQueue.length > 0 ? this.actionQueue.shift() : this.pollQueue.shift()

		if (msg === undefined) {
			clearInterval(this.sendTimer)
			this.sendTimer = undefined
		} else {
			this.safeSend(msg)
		}
	}

	/**
	 * INTERNAL: drop everything waiting to be sent.
	 *
	 * @access protected
	 * @since 2.3.2
	 */
	clearQueue() {
		this.actionQueue = []
		this.pollQueue = []

		if (this.sendTimer !== undefined) {
			clearInterval(this.sendTimer)
			this.sendTimer = undefined
		}
	}

	/**
	 * INTERNAL: write to the socket without letting a failed write become an
	 * unhandled promise rejection, which would terminate the module process.
	 *
	 * @param {string} msg - the raw string to write
	 * @returns {boolean} false if there was no connection to write to
	 * @access protected
	 * @since 2.3.2
	 */
	safeSend(msg) {
		if (this.socket === undefined || !this.socket.isConnected) {
			return false
		}

		this.socket.send(msg).catch((e) => {
			this.log('debug', `Send failed: ${e.message}`)
		})

		return true
	}

	/**
	 * INTERNAL: rebuild the action and feedback definitions (their dropdowns show
	 * channel names and transmitter IDs), coalescing bursts of name reports.
	 *
	 * @access protected
	 * @since 2.3.2
	 */
	scheduleDefinitionsUpdate() {
		if (this.definitionsTimer !== undefined) {
			return
		}

		this.definitionsTimer = setTimeout(() => {
			this.definitionsTimer = undefined
			this.updateActions()
			this.updateFeedbacks()
		}, DEFINITIONS_DEBOUNCE)
	}

	/**
	 * Collects variable changes and sends them to Companion once per event loop
	 * turn, instead of one message per property reported by the receiver.
	 *
	 * @param {Object} values - the variable values
	 * @access public
	 * @since 2.3.2
	 */
	setVariableValues(values) {
		Object.assign(this.pendingVariables, values)
		this.scheduleFlush()
	}

	/**
	 * Collects feedback checks, so each feedback type is evaluated once per event
	 * loop turn however many channels reported in.
	 *
	 * @param {...string} feedbackTypes - the feedbacks to check
	 * @access public
	 * @since 2.3.2
	 */
	checkFeedbacks(...feedbackTypes) {
		if (feedbackTypes.length == 0) {
			super.checkFeedbacks()
			return
		}

		for (let type of feedbackTypes) {
			this.pendingFeedbacks.add(type)
		}
		this.scheduleFlush()
	}

	/**
	 * INTERNAL: schedule the delivery of collected variables and feedback checks.
	 *
	 * @access protected
	 * @since 2.3.2
	 */
	scheduleFlush() {
		if (this.flushScheduled !== true) {
			this.flushScheduled = true
			setImmediate(() => this.flush())
		}
	}

	/**
	 * INTERNAL: deliver collected variables and feedback checks.
	 *
	 * @access protected
	 * @since 2.3.2
	 */
	flush() {
		this.flushScheduled = false

		if (this.destroyed === true) {
			return
		}

		let variables = this.pendingVariables
		this.pendingVariables = {}

		if (Object.keys(variables).length > 0) {
			super.setVariableValues(variables)
		}

		if (this.pendingFeedbacks.size > 0) {
			let feedbacks = [...this.pendingFeedbacks]
			this.pendingFeedbacks.clear()
			super.checkFeedbacks(...feedbacks)
		}
	}

	/**
	 * INTERNAL: Routes incoming data to the appropriate function for processing.
	 *
	 * @param {string} command - the command/data type being passed
	 * @access protected
	 * @since 1.0.0
	 */
	processShureCommand(command) {
		if ((typeof command === 'string' || command instanceof String) && command.length > 0) {
			let commandArr = command.split(' ')
			let commandType = commandArr.shift()

			if (commandArr.length == 0) {
				return
			}

			let commandNum = parseInt(commandArr[0])

			let joinData = function (commands, start) {
				let out = ''
				if (commands.length > 0) {
					for (let i = start; i < commands.length; i++) {
						out += commands[i] + ' '
					}
				}
				return out.trim()
			}

			if (commandType == 'REP' || commandType == 'REPORT') {
				//this is a report command

				if (commandArr[0] == 'ERR') {
					this.log('debug', 'Receiver rejected a command (REP ERR)')
				} else if (isNaN(commandNum)) {
					//this command isn't about a specific channel
					this.api.updateReceiver(commandArr[0], joinData(commandArr, 1))
				} else if (commandArr[1] && commandArr[1].startsWith('SLOT')) {
					//this command is about a specific SLOT in AD
					this.api.updateSlot(commandNum, parseInt(commandArr[2]), commandArr[1], joinData(commandArr, 3))
				} else if (commandArr[1]) {
					//this command is about a specific channel
					this.api.updateChannel(commandNum, commandArr[1], joinData(commandArr, 2))
				}
			} else if (commandType == 'SAMPLE') {
				//this is a sample command

				if (isNaN(commandNum)) {
					return
				}

				switch (this.model.family) {
					case 'ulx':
					case 'qlx':
						this.api.parseULXSample(commandNum, command)
						break
					case 'ad':
						this.api.parseADSample(commandNum, command)
						break
					case 'slx':
					case 'slxplus':
						this.api.parseSLXSample(commandNum, command)
						break
				}

				this.checkFeedbacks('sample')
			}
		}
	}

	/**
	 * INTERNAL: send a command to the receiver.
	 *
	 * @access protected
	 * @since 1.2.0
	 */
	sendCommand(cmd) {
		if (cmd !== undefined) {
			if (this.socket !== undefined && this.socket.isConnected) {
				this.queueCommand(cmd)
			} else {
				this.log('debug', 'Socket not connected :(')
			}
		}
	}

	/**
	 * INTERNAL: use model data to define the channel and slot choicess.
	 *
	 * @access protected
	 * @since 1.0.0
	 */
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

		let maxSlotChannels = this.model.id == 'anx4' ? 16 : this.model.channels

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

	/**
	 * Set up the fields used in actions and feedbacks
	 *
	 * @access protected
	 * @since 1.1.0
	 */
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
