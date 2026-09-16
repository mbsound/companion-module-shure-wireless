import { combineRgb } from '@companion-module/base'
import { Fields } from './setup.js'

/**
 * INTERNAL: initialize feedbacks.
 *
 * @access protected
 * @since 1.0.0
 */
export function updateFeedbacks() {
	// feedbacks
	let feedbacks = {}

	let labelChoices, labelDefault, iconChoices, iconDefault

	switch (this.model.family) {
		case 'qlx':
		case 'ulx':
			labelChoices = [
				{ id: 'name', label: 'Channel Name' },
				{ id: 'txDeviceId', label: 'TX Device ID' },
				{ id: 'frequency', label: 'Frequency' },
				{ id: 'groupChan', label: 'Group/Channel' },
				{ id: 'audioGain', label: 'Audio Gain' },
				{ id: 'txType', label: 'TX Model' },
				{ id: 'txPowerLevel', label: 'TX Power Level' },
				{ id: 'batteryType', label: 'Battery Type' },
				{ id: 'batteryRuntime', label: 'Battery Runtime' },
			]
			labelDefault = ['name', 'frequency', 'txType', 'txPowerLevel']
			iconChoices = [
				{ id: 'battery', label: 'Battery' },
				{ id: 'locks', label: 'Locks' },
				{ id: 'rf', label: 'RF' },
				{ id: 'audio', label: 'Audio Level' },
				{ id: 'encryption', label: 'Encryption' },
			]
			iconDefault = ['battery', 'locks', 'rf', 'audio', 'encryption']
			break
		case 'slx':
			labelChoices = [
				{ id: 'name', label: 'Channel Name' },
				{ id: 'frequency', label: 'Frequency' },
				{ id: 'groupChan', label: 'Group/Channel' },
				{ id: 'audioGain', label: 'Audio Gain' },
				{ id: 'txType', label: 'TX Model' },
				{ id: 'batteryRuntime', label: 'Battery Runtime' },
			]
			labelDefault = ['name', 'frequency', 'audioGain', 'txType']
			iconChoices = [
				{ id: 'battery', label: 'Battery' },
				{ id: 'rf', label: 'RF' },
				{ id: 'audio', label: 'Audio Level' },
			]
			iconDefault = ['battery', 'rf', 'audio']
			break
		case 'slxplus':
			labelChoices = [
				{ id: 'name', label: 'Channel Name' },
				{ id: 'frequency', label: 'Frequency' },
				{ id: 'groupChan', label: 'Group/Channel' },
				{ id: 'audioGain', label: 'Audio Gain' },
				{ id: 'txType', label: 'TX Model' },
				{ id: 'linkStatus', label: 'Link Status' },
				{ id: 'batteryRuntime', label: 'Battery Runtime' },
			]
			labelDefault = ['name', 'frequency', 'audioGain', 'txType']
			iconChoices = [
				{ id: 'battery', label: 'Battery' },
				{ id: 'rf', label: 'RF' },
				{ id: 'audio', label: 'Audio Level' },
				{ id: 'encryption', label: 'Encryption' },
			]
			iconDefault = ['battery', 'rf', 'audio', 'encryption']
			break
		case 'ad':
			labelChoices = [
				{ id: 'name', label: 'Channel Name' },
				{ id: 'txDeviceId', label: 'TX Device ID' },
				{ id: 'frequency', label: 'Frequency' },
				{ id: 'groupChan', label: 'Group/Channel' },
				{ id: 'audioGain', label: 'Audio Gain' },
				{ id: 'txType', label: 'TX Model' },
				{ id: 'txPowerLevel', label: 'TX Power Level' },
				{ id: 'batteryType', label: 'Battery Type' },
				{ id: 'batteryRuntime', label: 'Battery Runtime' },
				{ id: 'rfOutput', label: 'RF Output Status' },
				{ id: 'phantomPower', label: 'TX Phantom Power' },
				{ id: 'hpf', label: 'TX High Pass Filter' },
				{ id: 'antennaConfig', label: 'Antenna Configuration' },
			]
			labelDefault = ['name', 'frequency', 'txType', 'txPowerLevel']
			iconChoices = [
				{ id: 'battery', label: 'Battery' },
				{ id: 'locks', label: 'Locks' },
				{ id: 'rf', label: 'RF' },
				{ id: 'audio', label: 'Audio Level' },
				{ id: 'encryption', label: 'Encryption' },
				{ id: 'quality', label: 'Quality' },
			]
			iconDefault = ['battery', 'locks', 'rf', 'audio', 'encryption', 'quality']
			break
		case 'psm':
			labelChoices = [
				{ id: 'name', label: 'Channel Name' },
				{ id: 'frequency', label: 'Frequency' },
				{ id: 'groupChan', label: 'Group/Channel' },
				{ id: 'audioInLevel', label: 'Audio In Level' },
				{ id: 'rfTxLevel', label: 'RF TX Level' },
				{ id: 'rfMute', label: 'RF Mute' },
				{ id: 'audioTxMode', label: 'Audio TX Mode' },
				{ id: 'audioInLineLevel', label: 'Audio In Line Level' },
			]
			labelDefault = ['name', 'frequency', 'rfMute', 'rfTxLevel']
			iconChoices = []
			iconDefault = []
			break
	}

	feedbacks['sample'] = {
		type: 'advanced',
		name: 'Channel Status Display',
		description: "Provide a visual display of the channel's status.",
		options: [
			this.CHANNELS_FIELD,
			{
				type: 'multidropdown',
				label: 'Label Data',
				id: 'labels',
				default: labelDefault,
				choices: labelChoices,
			},
			{
				type: 'multidropdown',
				label: 'Icons',
				id: 'icons',
				default: iconDefault,
				choices: iconChoices,
			},
			Fields.BatteryLevel,
		],
		callback: (event) => {
			let opt = event.options
			let channel = this.api.getChannel(parseInt(opt.channel))
			let out = {
				alignment: 'left:top',
				imageBuffers: [{ buffer: this.api.getIcon(opt, event.image) }],
				size: '7',
				text: '',
			}

			let addLabelData = function (item, channel, out) {
				switch (item) {
					case 'name':
						out.text += channel.name + '\\n'
						break
					case 'txDeviceId':
						out.text += channel.txDeviceId + '\\n'
						break
					case 'frequency':
						out.text += channel.frequency + '\\n'
						break
					case 'groupChan':
						out.text += channel.groupChan + '\\n'
						break
					case 'audioGain':
						out.text += (channel.audioGain > 0 ? '+' : '') + channel.audioGain.toString() + ' dB\\n'
						break
					case 'txType':
						out.text += channel.txType + '\\n'
						break
					case 'txPowerLevel':
						out.text += channel.txPowerLevel == 255 ? 'Unknown\\n' : channel.txPowerLevel + ' mW\\n'
						break
					case 'batteryType':
						out.text += channel.batteryType + '\\n'
						break
					case 'batteryRuntime':
						out.text += channel.batteryRuntime2 + '\\n'
						break
					case 'rfOutput':
						out.text += channel.txRfOutput == 'RF_MUTE' ? 'RF MUTE\\n' : 'RF ON\\n'
						break
					case 'linkStatus':
						out.text += channel.linkStatus + '\\n'
						break
					case 'audioInLevel':
						out.text += channel.audioInLevel + ' dB\\n'
						break
					case 'rfTxLevel':
						out.text += channel.rfTxLevel + ' mW\\n'
						break
					case 'rfMute':
						out.text += (channel.rfMute == '1' ? 'RF MUTE' : 'RF ON') + '\\n'
						break
					case 'audioTxMode':
						out.text +=
							(channel.audioTxMode == '1' ? 'Mono' : channel.audioTxMode == '2' ? 'Point to Point' : 'Stereo') + '\\n'
						break
					case 'audioInLineLevel':
						out.text += (channel.audioInLineLevel == '1' ? 'Line' : 'Aux') + '\\n'
						break
					case 'phantomPower':
						out.text += channel.txPhantomPower + '\\n'
						break
					case 'hpf':
						out.text += channel.txHighPassFilter + '\\n'
						break
					case 'antennaConfig':
						out.text += channel.antennaConfiguration + '\\n'
						break
				}
			}

			if (typeof opt.labels === 'string') {
				addLabelData(opt.labels, channel, out)
			} else if (Array.isArray(opt.labels)) {
				opt.labels.forEach((item) => addLabelData(item, channel, out))
			}

			return out
		},
	}

	if (this.model.family != 'psm') {
		feedbacks['battery_level'] = {
			type: 'boolean',
			name: 'Battery Level',
			description: 'If the battery bar drops to or below a certain value, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 0, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.BatteryLevel],
			callback: ({ options }) => {
				if (this.api.getChannel(parseInt(options.channel)).batteryBars <= options.barlevel) {
					return true
				} else {
					return false
				}
			},
		}
	}

	if (this.model.family == 'ulx' || this.model.family == 'ad') {
		feedbacks['channel_muted'] = {
			type: 'boolean',
			name: 'Channel Muted',
			description: 'If the selected channel is muted, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(128, 0, 0),
			},
			options: [this.CHANNELS_FIELD],
			callback: ({ options }) => {
				if (this.api.getChannel(parseInt(options.channel)).audioMute == 'ON') {
					return true
				} else {
					return false
				}
			},
		}
	}

	if (this.model.family != 'slx' && this.model.family != 'slxplus' && this.model.family != 'psm') {
		feedbacks['transmitter_muted'] = {
			type: 'boolean',
			name: 'Transmitter Muted',
			description: "If the selected channel's transmitter is muted, change the color of the button.",
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(128, 0, 0),
			},
			options: [this.CHANNELS_FIELD],
			callback: ({ options }) => {
				if (this.api.getChannel(parseInt(options.channel)).txMuteStatus == 'ON') {
					return true
				} else {
					return false
				}
			},
		}
	}

	if (this.model.family != 'slx' && this.model.family != 'psm') {
		feedbacks['interference_status'] = {
			type: 'boolean',
			name: 'Interference Status',
			description: 'If the selected channel gets interference, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 0, 0),
			},
			options: [this.CHANNELS_FIELD],
			callback: ({ options }) => {
				if (this.api.getChannel(parseInt(options.channel)).interferenceStatus == 'DETECTED') {
					return true
				} else {
					return false
				}
			},
		}

		feedbacks['encryption_warning'] = {
			type: 'boolean',
			name: 'Encryption Warning',
			description: 'If an encryption mismatch or warning is detected on the channel, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 0, 0),
			},
			options: [this.CHANNELS_FIELD],
			callback: ({ options }) => {
				return this.api.getChannel(parseInt(options.channel)).encryptionStatus == 'ERROR'
			},
		}
	}

	feedbacks['channel_frequency'] = {
		type: 'boolean',
		name: 'Channel Frequency',
		description: "If the selected channel's frequency is set, change the color of the button.",
		defaultStyle: {
			color: combineRgb(0, 0, 0),
			bgcolor: combineRgb(255, 255, 0),
		},
		options: [this.CHANNELS_FIELD, Fields.Frequency],
		callback: ({ options }) => {
			if (this.api.getChannel(parseInt(options.channel)).frequency == options.value) {
				return true
			} else {
				return false
			}
		},
	}

	if (this.model.family != 'psm') {
		feedbacks['channel_gain'] = {
			type: 'boolean',
			name: 'Channel Gain',
			description: "If the selected channel's gain is set, change the color of the button.",
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.GainSet],
			callback: ({ options }) => {
				if (this.api.getChannel(parseInt(options.channel)).audioGain == options.gain) {
					return true
				} else {
					return false
				}
			},
		}

		feedbacks['transmitter_turned_off'] = {
			type: 'boolean',
			name: 'Transmitter Turned Off',
			description: "If the selected channel's transmitter is powered off, change the color of the button.",
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 0, 128),
			},
			options: [this.CHANNELS_FIELD],
			callback: ({ options }) => {
				if (
					this.api.getChannel(parseInt(options.channel)).txType == 'Unknown' ||
					this.api.getChannel(parseInt(options.channel)).batteryBars == 255
				) {
					return true
				} else {
					return false
				}
			},
		}

		feedbacks['audio_peak_clip'] = {
			type: 'boolean',
			name: 'Audio Peak / Clipping Alert',
			description: 'If the audio level is peaking or clipping above the threshold, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 0, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.AudioPeakThreshold],
			callback: ({ options }) => {
				let ch = this.api.getChannel(parseInt(options.channel))
				return ch.audioLevel >= options.threshold || ch.audioLevelPeak >= options.threshold || ch.audioLED >= 7
			},
		}
	}

	if (this.model.family == 'ad' || this.model.family == 'ulx') {
		feedbacks['talk_switch_pressed'] = {
			type: 'boolean',
			name: 'Transmitter Talk Switch Pressed',
			description: 'If the transmitter talk switch / mute button is pressed, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 128, 255),
			},
			options: [this.CHANNELS_FIELD],
			callback: ({ options }) => {
				return this.api.getChannel(parseInt(options.channel)).txTalkSwitch == 'PRESSED'
			},
		}
	}

	if (this.model.family == 'slx' || this.model.family == 'slxplus') {
		feedbacks['audio_out_lvl_switch'] = {
			type: 'boolean',
			name: 'Audio Output Level Switch (Mic/Line)',
			description: 'If the channel audio output switch matches the selected level, change the color of the button.',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.MicLine],
			callback: ({ options }) => {
				return this.api.getChannel(parseInt(options.channel)).audioOutLevelSwitch == options.level
			},
		}
	}

	if (this.model.family == 'slxplus') {
		feedbacks['slx_link_status'] = {
			type: 'boolean',
			name: 'Linked Transmitter Status (SLX-D+)',
			description: 'If the linked transmitter status matches the selected status, change the color of the button.',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(100, 255, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.LinkStatus],
			callback: ({ options }) => {
				return this.api.getChannel(parseInt(options.channel)).linkStatus == options.status
			},
		}
	}

	if (this.model.family == 'ad') {
		feedbacks['channel_rf_muted'] = {
			type: 'boolean',
			name: 'Channel RF Muted',
			description:
				"If the selected channel's transmitter RF output is muted (ShowLink), change the color of the button.",
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(128, 0, 0),
			},
			options: [this.CHANNELS_FIELD],
			callback: ({ options }) => {
				let ch = this.api.getChannel(parseInt(options.channel))
				if (ch.txRfOutput == 'RF_MUTE') return true
				for (let slot of ch.slots) {
					if (slot && (slot.status == 'LINKED.ACTIVE' || slot.status == 'STANDARD') && slot.txRfOutput == 'RF_MUTE') {
						return true
					}
				}
				return false
			},
		}

		feedbacks['signal_quality'] = {
			type: 'boolean',
			name: 'Signal Quality Alert',
			description:
				'If the channel signal quality drops to or below a certain threshold, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 128, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.QualityThreshold],
			callback: ({ options }) => {
				let q = this.api.getChannel(parseInt(options.channel)).signalQuality
				return q !== 255 && q <= options.threshold
			},
		}

		feedbacks['unregistered_tx'] = {
			type: 'boolean',
			name: 'Unregistered Transmitter Warning',
			description: 'If an unregistered transmitter is detected on the channel, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 0, 0),
			},
			options: [this.CHANNELS_FIELD],
			callback: ({ options }) => {
				return this.api.getChannel(parseInt(options.channel)).unregisteredTxStatus == 'ERROR'
			},
		}

		feedbacks['fd_mode_active'] = {
			type: 'boolean',
			name: 'Frequency Diversity Active',
			description: 'If Frequency Diversity is active on the channel, change the color of the button.',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(0, 255, 255),
			},
			options: [this.CHANNELS_FIELD],
			callback: ({ options }) => {
				let fd = this.api.getChannel(parseInt(options.channel)).fdMode
				return fd == 'FD-C' || fd == 'FD-S'
			},
		}

		feedbacks['quadversity_active'] = {
			type: 'boolean',
			name: 'Quadversity Mode Active',
			description: 'If Quadversity mode is enabled on the receiver, change the color of the button.',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(0, 255, 255),
			},
			options: [],
			callback: () => {
				return this.api.getReceiver().quadversityMode == 'ON'
			},
		}

		feedbacks['transmission_mode_hd'] = {
			type: 'boolean',
			name: 'High Density Transmission Mode',
			description: 'If High Density transmission mode is active, change the color of the button.',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			options: [],
			callback: () => {
				return this.api.getReceiver().highDensity == 'ON'
			},
		}

		feedbacks['slot_is_active'] = {
			type: 'boolean',
			name: 'Slot is Active',
			description: "If the selected slot's transmitter is active to the channel, change the color of the button",
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			options: [this.SLOTS_FIELD],
			callback: ({ options }) => {
				let slot = options.slot.split(':')
				let ch = this.api.getChannel(parseInt(slot[0]))
				slot = this.api.getSlot(parseInt(slot[0]), parseInt(slot[1]))
				if (
					ch.txDeviceId == slot.txDeviceId &&
					(slot.status == 'STANDARD' || (slot.status.match(/LINKED/) && slot.txRfOutput == 'RF_ON'))
				) {
					return true
				} else {
					return false
				}
			},
		}

		feedbacks['slot_status'] = {
			type: 'boolean',
			name: 'Slot Status',
			description: "If the selected slot's status is set, change the color of the button",
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			options: [this.SLOTS_FIELD, Fields.SlotStatus],
			callback: ({ options }) => {
				let slot = options.slot.split(':')
				if (this.api.getSlot(parseInt(slot[0]), parseInt(slot[1])).status == options.value) {
					return true
				} else {
					return false
				}
			},
		}

		feedbacks['slot_rf_output'] = {
			type: 'boolean',
			name: 'Slot RF Output',
			description: "If the selected slot's transmitter RF is set, change the color of the button.",
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(100, 255, 0),
			},
			options: [this.SLOTS_FIELD, Fields.RfOutput],
			callback: ({ options }) => {
				let slot = options.slot.split(':')
				if (this.api.getSlot(parseInt(slot[0]), parseInt(slot[1])).txRfOutput == options.onoff) {
					return true
				} else {
					return false
				}
			},
		}

		feedbacks['slot_rf_power'] = {
			type: 'boolean',
			name: 'Slot RF Power',
			description: "If the selected slot's transmitter power level is set, change the color of the button.",
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(100, 255, 0),
			},
			options: [this.SLOTS_FIELD, Fields.RfPower],
			callback: ({ options }) => {
				let slot = options.slot.split(':')
				if (this.api.getSlot(parseInt(slot[0]), parseInt(slot[1])).txPowerMode == options.power) {
					return true
				} else {
					return false
				}
			},
		}

		feedbacks['antenna_configuration'] = {
			type: 'boolean',
			name: 'Antenna Configuration',
			description: 'If the channel antenna configuration matches the selected mode, change the color of the button.',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(0, 255, 255),
			},
			options: [this.CHANNELS_FIELD, Fields.AntennaConfiguration],
			callback: ({ options }) => {
				return this.api.getChannel(parseInt(options.channel)).antennaConfiguration == options.value
			},
		}

		feedbacks['tx_phantom_power'] = {
			type: 'boolean',
			name: 'Transmitter Phantom Power (Channel)',
			description: 'If the transmitter phantom power matches the selected state, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 0, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.TxPhantomPower],
			callback: ({ options }) => {
				let ppMap = { '0000': 'Off', '012': '+12V', '048': '+48V' }
				let expected = ppMap[options.value] || options.value
				return this.api.getChannel(parseInt(options.channel)).txPhantomPower == expected
			},
		}

		feedbacks['tx_high_pass_filter'] = {
			type: 'boolean',
			name: 'Transmitter High Pass Filter (Channel)',
			description: 'If the transmitter high pass filter matches the selected cutoff, change the color of the button.',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(0, 255, 255),
			},
			options: [this.CHANNELS_FIELD, Fields.TxHighPassFilter],
			callback: ({ options }) => {
				let hpfMap = { '000': 'Off', '040': '40 Hz', '080': '80 Hz', '160': '160 Hz', '240': '240 Hz' }
				let expected = hpfMap[options.value] || options.value
				return this.api.getChannel(parseInt(options.channel)).txHighPassFilter == expected
			},
		}

		feedbacks['slot_phantom_power'] = {
			type: 'boolean',
			name: 'Transmitter Phantom Power (Slot)',
			description: 'If the slot transmitter phantom power matches the selected state, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 0, 0),
			},
			options: [this.SLOTS_FIELD, Fields.TxPhantomPower],
			callback: ({ options }) => {
				let slot = options.slot.split(':')
				let ppMap = { '0000': 'Off', '012': '+12V', '048': '+48V' }
				let expected = ppMap[options.value] || options.value
				return this.api.getSlot(parseInt(slot[0]), parseInt(slot[1])).txPhantomPower == expected
			},
		}

		feedbacks['slot_high_pass_filter'] = {
			type: 'boolean',
			name: 'Transmitter High Pass Filter (Slot)',
			description: 'If the slot transmitter high pass filter matches the selected cutoff, change the color of the button.',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(0, 255, 255),
			},
			options: [this.SLOTS_FIELD, Fields.TxHighPassFilter],
			callback: ({ options }) => {
				let slot = options.slot.split(':')
				let hpfMap = { '000': 'Off', '040': '40 Hz', '080': '80 Hz', '160': '160 Hz', '240': '240 Hz' }
				let expected = hpfMap[options.value] || options.value
				return this.api.getSlot(parseInt(slot[0]), parseInt(slot[1])).txHighPassFilter == expected
			},
		}
	}

	if (this.model.family == 'ulx') {
		feedbacks['high_density_mode'] = {
			type: 'boolean',
			name: 'High Density Mode Active',
			description: 'If High Density mode is active on the receiver, change the color of the button.',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			options: [],
			callback: () => {
				return this.api.getReceiver().highDensity == 'ON'
			},
		}

		if (this.model.id == 'ulxd4d' || this.model.id == 'ulxd4q') {
			feedbacks['audio_summing_mode'] = {
				type: 'boolean',
				name: 'Audio Summing Mode',
				description: 'If the audio summing mode matches the selected mode, change the color of the button.',
				defaultStyle: {
					color: combineRgb(0, 0, 0),
					bgcolor: combineRgb(0, 255, 255),
				},
				options: [Fields.AudioSumming],
				callback: ({ options }) => {
					return this.api.getReceiver().audioSumming == options.mode
				},
			}

			feedbacks['frequency_diversity_mode'] = {
				type: 'boolean',
				name: 'Frequency Diversity Mode',
				description: 'If the frequency diversity mode matches the selected mode, change the color of the button.',
				defaultStyle: {
					color: combineRgb(0, 0, 0),
					bgcolor: combineRgb(0, 255, 255),
				},
				options: [Fields.FrequencyDiversity],
				callback: ({ options }) => {
					return this.api.getReceiver().frequencyDiversity == options.mode
				},
			}
		}

		feedbacks['scan_lock_active'] = {
			type: 'boolean',
			name: 'Scan Lock Active',
			description: 'If Scan Lock is active on the receiver, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 128, 0),
			},
			options: [],
			callback: () => {
				return this.api.getReceiver().scanLock == 'ON'
			},
		}

		feedbacks['sync_lock_active'] = {
			type: 'boolean',
			name: 'Sync Lock Active',
			description: 'If Sync Lock is active on the receiver, change the color of the button.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 128, 0),
			},
			options: [],
			callback: () => {
				return this.api.getReceiver().syncLock == 'ON'
			},
		}
	}

	if (this.model.family == 'psm') {
		feedbacks['psm_rf_muted'] = {
			type: 'boolean',
			name: 'RF Mute State',
			description: "If the selected channel's RF is muted, change the color of the button.",
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 0, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.PsmRfMute],
			callback: ({ options }) => {
				let ch = this.api.getChannel(parseInt(options.channel))
				if (options.choice === 'TOGGLE') {
					return ch.rfMute === '1'
				}
				return ch.rfMute === options.choice
			},
		}

		feedbacks['psm_rf_tx_level'] = {
			type: 'boolean',
			name: 'RF TX Power Level',
			description: "If the selected channel's RF is set to a specific power level, change the color of the button.",
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 128, 255),
			},
			options: [this.CHANNELS_FIELD, Fields.PsmRfTxLevel],
			callback: ({ options }) => {
				return this.api.getChannel(parseInt(options.channel)).rfTxLevel == options.level
			},
		}

		feedbacks['psm_audio_tx_mode'] = {
			type: 'boolean',
			name: 'Audio TX Mode',
			description: "If the selected channel's audio TX mode matches, change the color of the button.",
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(200, 200, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.PsmAudioTxMode],
			callback: ({ options }) => {
				return this.api.getChannel(parseInt(options.channel)).audioTxMode == options.mode
			},
		}

		feedbacks['psm_audio_in_line_level'] = {
			type: 'boolean',
			name: 'Audio Input Line Level',
			description: "If the selected channel's input sensitivity matches, change the color of the button.",
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(200, 200, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.PsmAudioInLineLevel],
			callback: ({ options }) => {
				let ch = this.api.getChannel(parseInt(options.channel))
				if (options.level === 'TOGGLE') {
					return ch.audioInLineLevel === '1'
				}
				return ch.audioInLineLevel == options.level
			},
		}

		feedbacks['psm_audio_in_level'] = {
			type: 'boolean',
			name: 'Audio Input Level',
			description: "If the selected channel's audio input level matches, change the color of the button.",
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 255, 0),
			},
			options: [this.CHANNELS_FIELD, Fields.PsmGainSet],
			callback: ({ options }) => {
				return this.api.getChannel(parseInt(options.channel)).audioInLevel == parseInt(options.gain)
			},
		}

		feedbacks['psm_audio_clip'] = {
			type: 'boolean',
			name: 'Audio Input Peak / Clip Alert',
			description: 'If the audio input level on L or R channel reaches or exceeds the threshold, change button color.',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 0, 0),
			},
			options: [
				this.CHANNELS_FIELD,
				{
					type: 'number',
					label: 'Threshold (0-115)',
					id: 'threshold',
					min: 0,
					max: 115,
					default: 110,
					required: true,
				},
			],
			callback: ({ options }) => {
				let ch = this.api.getChannel(parseInt(options.channel))
				return ch.audioInLevelL >= options.threshold || ch.audioInLevelR >= options.threshold
			},
		}
	}

	this.setFeedbackDefinitions(feedbacks)
}
