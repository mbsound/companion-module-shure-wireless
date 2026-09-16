import { Fields, Regex } from './setup.js'

/**
 * INTERNAL: Set the available actions.
 *
 * @access protected
 * @since 1.0.0
 */
export function updateActions() {
	this.setupChannelChoices()

	let actions = {}

	actions['set_channel_name'] = {
		name: 'Set channel name',
		options: [this.CHANNELS_FIELD, Fields.Name],
		callback: async (event, context) => {
			const options = event.options
			let name = await this.parseActionOption(event, 'name', context, Regex.Name)
			if (name) {
				this.sendCommand(`SET ${options.channel} CHAN_NAME {${name}}`)
			}
		},
	}

	actions['set_device_id'] = {
		name: 'Set device ID / receiver name',
		options: [Fields.DeviceId],
		callback: async (event, context) => {
			let name = await this.parseActionOption(event, 'name', context, Regex.Name)
			if (name) {
				let cmd = this.model.family === 'psm' ? `SET DEVICE_NAME ${name}` : `SET DEVICE_ID {${name}}`
				this.sendCommand(cmd)
			}
		},
	}

	actions['set_group_chan'] = {
		name: 'Set Group and Channel',
		options: [this.CHANNELS_FIELD, Fields.Group, Fields.ChannelNum],
		callback: async (event, context) => {
			const options = event.options
			let group = await this.parseActionOption(event, 'group', context)
			let channel = await this.parseActionOption(event, 'channel_num', context)
			if (group && channel) {
				let cmd =
					this.model.family === 'ulx' || this.model.family === 'qlx' || this.model.family === 'psm'
						? 'GROUP_CHAN'
						: 'GROUP_CHANNEL'
				this.sendCommand(`SET ${options.channel} ${cmd} ${group},${channel}`)
			}
		},
	}

	if (this.model.family == 'ulx' || this.model.family == 'ad') {
		actions['channel_mute'] = {
			name: 'Mute or unmute channel',
			options: [this.CHANNELS_A_FIELD, Fields.Mute],
			callback: async ({ options }) => {
				this.sendCommand(`SET ${options.channel} AUDIO_MUTE ${options.choice}`)
			},
		}
	}

	if (this.model.family != 'psm') {
		actions['channel_setaudiogain'] = {
			name: 'Set audio gain of channel',
			options: [this.CHANNELS_A_FIELD, Fields.GainSet],
			callback: async (event, context) => {
				const options = event.options
				let gainValue = await this.parseActionOption(event, 'gain', context, Regex.GainSet)
				if (gainValue) {
					gainValue = 18 + parseInt(gainValue)
					this.sendCommand(`SET ${options.channel} AUDIO_GAIN ${gainValue}`)
				}
			},
		}

		actions['channel_increasegain'] = {
			name: 'Increase audio gain of channel',
			options: [this.CHANNELS_A_FIELD, Fields.GainIncrement],
			callback: async (event, context) => {
				const options = event.options
				let gainIncrement = await this.parseActionOption(event, 'gain', context, Regex.GainIncrement)
				if (gainIncrement) {
					this.sendCommand(`SET ${options.channel} AUDIO_GAIN INC ${gainIncrement}`)
				}
			},
		}

		actions['channel_decreasegain'] = {
			name: 'Decrease audio gain of channel',
			options: [this.CHANNELS_A_FIELD, Fields.GainIncrement],
			callback: async (event, context) => {
				const options = event.options
				let gainIncrement = await this.parseActionOption(event, 'gain', context, Regex.GainIncrement)
				if (gainIncrement) {
					this.sendCommand(`SET ${options.channel} AUDIO_GAIN DEC ${gainIncrement}`)
				}
			},
		}
	}

	actions['channel_frequency'] = {
		name: 'Set frequency of channel',
		options: [this.CHANNELS_FIELD, Fields.Frequency],
		callback: async (event, context) => {
			const options = event.options
			let freq = await this.parseActionOption(event, 'value', context, Regex.Frequency)
			if (freq) {
				this.sendCommand(`SET ${options.channel} FREQUENCY ${freq.replace('.', '')}`)
			}
		},
	}

	if (this.model.family != 'qlx' && this.model.family != 'psm') {
		actions['flash_lights'] = {
			name: 'Flash lights on receiver',
			tooltip: 'It will automatically turn off after 30 seconds',
			options: [],
			callback: async ({ options }) => {
				this.sendCommand(`SET FLASH ON`)
			},
		}
	}

	if (this.model.family == 'ad' || this.model.family == 'slx' || this.model.family == 'slxplus') {
		actions['flash_channel'] = {
			name: 'Flash lights on receiver channel',
			tooltip: 'It will automatically turn off after 60 seconds',
			options: [this.CHANNELS_FIELD],
			callback: async ({ options }) => {
				this.sendCommand(`SET ${options.channel} FLASH ON`)
			},
		}
	}

	if (this.model.family == 'ad') {
		actions['channel_rf_mute'] = {
			name: 'Mute or unmute channel RF output (ADX)',
			tooltip: 'Remotely mutes or unmutes transmitter RF output via ShowLink for the selected channel',
			options: [this.CHANNELS_A_FIELD, Fields.RfOutput],
			callback: async ({ options }) => {
				let onoff = options.onoff
				let chNum = parseInt(options.channel)
				if (onoff === 'TOGGLE') {
					let current = chNum === 0 ? this.api.getChannel(1).txRfOutput : this.api.getChannel(chNum).txRfOutput
					onoff = current === 'RF_MUTE' ? 'RF_ON' : 'RF_MUTE'
				}
				// In Axient Digital, slot 0 addresses all slots for the specified channel
				this.sendCommand(`SET ${options.channel} SLOT_RF_OUTPUT 0 ${onoff}`)
			},
		}

		actions['slot_rf_output'] = {
			name: 'Set slot RF output (ADX)',
			options: [this.SLOTS_A_FIELD, Fields.RfOutput],
			callback: async ({ options }) => {
				let slot = options.slot.split(':')
				let onoff = options.onoff
				if (onoff === 'TOGGLE') {
					let chNum = parseInt(slot[0])
					let slotNum = parseInt(slot[1])
					let current = this.api.getSlot(chNum === 0 ? 1 : chNum, slotNum === 0 ? 1 : slotNum).txRfOutput
					onoff = current === 'RF_MUTE' ? 'RF_ON' : 'RF_MUTE'
				}
				this.sendCommand(`SET ${slot[0]} SLOT_RF_OUTPUT ${slot[1]} ${onoff}`)
			},
		}

		actions['slot_rf_power'] = {
			name: 'Set slot RF power level (ADX)',
			options: [this.SLOTS_A_FIELD, Fields.RfPower],
			callback: async ({ options }) => {
				let slot = options.slot.split(':')
				this.sendCommand(`SET ${slot[0]} SLOT_RF_POWER_MODE ${slot[1]} ${options.power}`)
			},
		}

		actions['slot_offset'] = {
			name: 'Set slot audio offset (ADX)',
			options: [this.SLOTS_FIELD, Fields.SlotOffsetSet],
			callback: async (event, context) => {
				const options = event.options
				let offset = await this.parseActionOption(event, 'offset', context)
				if (offset !== null && offset !== undefined && offset !== '') {
					let slot = options.slot.split(':')
					let val = parseInt(offset) + 12
					if (!isNaN(val) && val >= 0 && val <= 33) {
						this.sendCommand(`SET ${slot[0]} SLOT_OFFSET ${slot[1]} ${val}`)
					}
				}
			},
		}

		actions['slot_offset_inc'] = {
			name: 'Increase slot audio offset (ADX)',
			options: [this.SLOTS_FIELD, Fields.SlotOffsetInc],
			callback: async (event, context) => {
				const options = event.options
				let inc = await this.parseActionOption(event, 'offset', context)
				if (inc) {
					let slot = options.slot.split(':')
					this.sendCommand(`SET ${slot[0]} SLOT_OFFSET ${slot[1]} INC ${inc}`)
				}
			},
		}

		actions['slot_offset_dec'] = {
			name: 'Decrease slot audio offset (ADX)',
			options: [this.SLOTS_FIELD, Fields.SlotOffsetInc],
			callback: async (event, context) => {
				const options = event.options
				let dec = await this.parseActionOption(event, 'offset', context)
				if (dec) {
					let slot = options.slot.split(':')
					this.sendCommand(`SET ${slot[0]} SLOT_OFFSET ${slot[1]} DEC ${dec}`)
				}
			},
		}

		actions['slot_input_pad'] = {
			name: 'Set slot input pad (ADX1)',
			options: [this.SLOTS_FIELD, Fields.SlotInputPad],
			callback: async ({ options }) => {
				let slot = options.slot.split(':')
				let pad = options.pad
				if (pad === 'TOGGLE') {
					let current = this.api.getSlot(parseInt(slot[0]), parseInt(slot[1])).txInputPad
					pad = current === 0 ? '12' : '0'
				}
				this.sendCommand(`SET ${slot[0]} SLOT_INPUT_PAD ${slot[1]} ${pad}`)
			},
		}

		actions['slot_polarity'] = {
			name: 'Set slot polarity (ADX1/ADX1M)',
			options: [this.SLOTS_FIELD, Fields.SlotPolarity],
			callback: async ({ options }) => {
				let slot = options.slot.split(':')
				let pol = options.polarity
				if (pol === 'TOGGLE') {
					let current = this.api.getSlot(parseInt(slot[0]), parseInt(slot[1])).txPolarity
					pol = current === 'POSITIVE' ? 'NEGATIVE' : 'POSITIVE'
				}
				this.sendCommand(`SET ${slot[0]} SLOT_POLARITY ${slot[1]} ${pol}`)
			},
		}

		actions['slot_tx_device_id'] = {
			name: 'Set slot transmitter Device ID (ADX)',
			options: [this.SLOTS_FIELD, Fields.Name],
			callback: async (event, context) => {
				const options = event.options
				let slot = options.slot.split(':')
				let name = await this.parseActionOption(event, 'name', context, Regex.Name)
				if (name) {
					this.sendCommand(`SET ${slot[0]} SLOT_TX_DEVICE_ID ${slot[1]} {${name}}`)
				}
			},
		}

		actions['slot_phantom_power'] = {
			name: 'Set slot transmitter Phantom Power (ADX3)',
			options: [this.SLOTS_FIELD, Fields.TxPhantomPower],
			callback: async ({ options }) => {
				let slot = options.slot.split(':')
				this.sendCommand(`SET ${slot[0]} SLOT_PHANTOM_POWER ${slot[1]} ${options.value}`)
			},
		}

		actions['slot_high_pass_filter'] = {
			name: 'Set slot transmitter High Pass Filter (ADX3)',
			options: [this.SLOTS_FIELD, Fields.TxHighPassFilter],
			callback: async ({ options }) => {
				let slot = options.slot.split(':')
				this.sendCommand(`SET ${slot[0]} SLOT_HIGH_PASS_FILTER ${slot[1]} ${options.value}`)
			},
		}

		if (this.model.id == 'anx4') {
			actions['set_antenna_configuration'] = {
				name: 'Set antenna configuration',
				options: [this.CHANNELS_FIELD, Fields.AntennaConfiguration],
				callback: async ({ options }) => {
					this.sendCommand(`SET ${options.channel} ANTENNA_CONFIGURATION ${options.value}`)
				},
			}
		}

		actions['set_transmission_mode'] = {
			name: 'Set transmission mode (Standard / High Density)',
			options: [Fields.TransmissionMode],
			callback: async ({ options }) => {
				let mode = options.mode
				if (mode === 'TOGGLE') {
					mode = this.api.getReceiver().highDensity === 'ON' ? 'STANDARD' : 'HIGH_DENSITY'
				}
				this.sendCommand(`SET TRANSMISSION_MODE ${mode}`)
			},
		}
	}

	if (this.model.family == 'ulx') {
		actions['set_high_density'] = {
			name: 'Set high density mode',
			options: [Fields.HighDensity],
			callback: async ({ options }) => {
				let mode = options.mode
				if (mode === 'TOGGLE') {
					mode = this.api.getReceiver().highDensity === 'ON' ? 'OFF' : 'ON'
				}
				this.sendCommand(`SET HIGH_DENSITY ${mode}`)
			},
		}

		if (this.model.id == 'ulxd4d' || this.model.id == 'ulxd4q') {
			actions['set_audio_summing'] = {
				name: 'Set audio summing mode',
				options: [Fields.AudioSumming],
				callback: async ({ options }) => {
					this.sendCommand(`SET AUDIO_SUMMING_MODE ${options.mode}`)
				},
			}

			actions['set_frequency_diversity'] = {
				name: 'Set frequency diversity mode',
				options: [Fields.FrequencyDiversity],
				callback: async ({ options }) => {
					this.sendCommand(`SET FREQUENCY_DIVERSITY_MODE ${options.mode}`)
				},
			}
		}

		actions['set_encryption'] = {
			name: 'Set encryption mode',
			options: [Fields.EncryptionMode],
			callback: async ({ options }) => {
				this.sendCommand(`SET ENCRYPTION ${options.mode}`)
			},
		}

		actions['regenerate_encryption_key'] = {
			name: 'Regenerate encryption key',
			options: [],
			callback: async () => {
				this.sendCommand('SET ENCRYPTION_REGENERATE_KEY ON')
			},
		}

		actions['set_scan_lock'] = {
			name: 'Set scan lock',
			options: [Fields.LockState],
			callback: async ({ options }) => {
				let state = options.state
				if (state === 'TOGGLE') {
					state = this.api.getReceiver().scanLock === 'ON' ? 'OFF' : 'ON'
				}
				this.sendCommand(`SET SCAN_LOCK ${state}`)
			},
		}

		actions['set_sync_lock'] = {
			name: 'Set sync lock',
			options: [Fields.LockState],
			callback: async ({ options }) => {
				let state = options.state
				if (state === 'TOGGLE') {
					state = this.api.getReceiver().syncLock === 'ON' ? 'OFF' : 'ON'
				}
				this.sendCommand(`SET SYNC_LOCK ${state}`)
			},
		}
	}

	if (this.model.family == 'slxplus') {
		actions['remote_pairing'] = {
			name: 'Start remote pairing (SLX-D+)',
			tooltip: 'Initiate Bluetooth Low Energy remote pairing on this channel',
			options: [this.CHANNELS_FIELD],
			callback: async ({ options }) => {
				this.sendCommand(`SET ${options.channel} REM_PAIR ON`)
			},
		}

		actions['reboot_linked_tx'] = {
			name: 'Reboot linked transmitter (SLX-D+)',
			tooltip: 'Remotely reboot the transmitter linked to this channel',
			options: [this.CHANNELS_FIELD],
			callback: async ({ options }) => {
				this.sendCommand(`SET ${options.channel} LINK_TX_REBOOT ON`)
			},
		}
	}

	if (this.model.family == 'psm') {
		actions['psm_set_audio_in_level'] = {
			name: 'Set audio input level (-67 to 0 dB)',
			options: [this.CHANNELS_A_FIELD, Fields.PsmGainSet],
			callback: async (event, context) => {
				const options = event.options
				let gain = await this.parseActionOption(event, 'gain', context, Regex.PsmGainSet)
				if (gain !== null && gain !== undefined) {
					let level = parseInt(gain)
					if (options.channel == '0') {
						for (let i = 1; i <= this.model.channels; i++) {
							this.sendCommand(`SET ${i} AUDIO_IN_LVL ${level}`)
						}
					} else {
						this.sendCommand(`SET ${options.channel} AUDIO_IN_LVL ${level}`)
					}
				}
			},
		}

		actions['psm_increase_audio_in_level'] = {
			name: 'Increase audio input level',
			options: [this.CHANNELS_A_FIELD, Fields.PsmGainIncrement],
			callback: async (event, context) => {
				const options = event.options
				let inc = await this.parseActionOption(event, 'gain', context, Regex.PsmGainIncrement)
				if (inc !== null && inc !== undefined) {
					let step = parseInt(inc)
					let chList = options.channel == '0' ? [1, 2] : [parseInt(options.channel)]
					for (let ch of chList) {
						let current = this.api.getChannel(ch).audioInLevel || 0
						let target = Math.min(0, Math.max(-67, current + step))
						this.sendCommand(`SET ${ch} AUDIO_IN_LVL ${target}`)
					}
				}
			},
		}

		actions['psm_decrease_audio_in_level'] = {
			name: 'Decrease audio input level',
			options: [this.CHANNELS_A_FIELD, Fields.PsmGainIncrement],
			callback: async (event, context) => {
				const options = event.options
				let dec = await this.parseActionOption(event, 'gain', context, Regex.PsmGainIncrement)
				if (dec !== null && dec !== undefined) {
					let step = parseInt(dec)
					let chList = options.channel == '0' ? [1, 2] : [parseInt(options.channel)]
					for (let ch of chList) {
						let current = this.api.getChannel(ch).audioInLevel || 0
						let target = Math.min(0, Math.max(-67, current - step))
						this.sendCommand(`SET ${ch} AUDIO_IN_LVL ${target}`)
					}
				}
			},
		}

		actions['psm_rf_mute'] = {
			name: 'Mute, unmute, or toggle RF output',
			options: [this.CHANNELS_A_FIELD, Fields.PsmRfMute],
			callback: async ({ options }) => {
				let choice = options.choice
				let chList = options.channel == '0' ? [1, 2] : [parseInt(options.channel)]
				for (let ch of chList) {
					let val = choice
					if (val === 'TOGGLE') {
						let current = this.api.getChannel(ch).rfMute
						val = current === '1' ? '0' : '1'
					}
					this.sendCommand(`SET ${ch} RF_MUTE ${val}`)
				}
			},
		}

		actions['psm_rf_tx_level'] = {
			name: 'Set RF TX power level',
			options: [this.CHANNELS_A_FIELD, Fields.PsmRfTxLevel],
			callback: async ({ options }) => {
				let chList = options.channel == '0' ? [1, 2] : [parseInt(options.channel)]
				for (let ch of chList) {
					this.sendCommand(`SET ${ch} RF_TX_LVL ${options.level}`)
				}
			},
		}

		actions['psm_audio_tx_mode'] = {
			name: 'Set audio TX mode (Mono/Point to Point/Stereo)',
			options: [this.CHANNELS_A_FIELD, Fields.PsmAudioTxMode],
			callback: async ({ options }) => {
				let chList = options.channel == '0' ? [1, 2] : [parseInt(options.channel)]
				for (let ch of chList) {
					this.sendCommand(`SET ${ch} AUDIO_TX_MODE ${options.mode}`)
				}
			},
		}

		actions['psm_audio_in_line_level'] = {
			name: 'Set or toggle audio input line level (Aux/Line)',
			options: [this.CHANNELS_A_FIELD, Fields.PsmAudioInLineLevel],
			callback: async ({ options }) => {
				let level = options.level
				let chList = options.channel == '0' ? [1, 2] : [parseInt(options.channel)]
				for (let ch of chList) {
					let val = level
					if (val === 'TOGGLE') {
						let current = this.api.getChannel(ch).audioInLineLevel
						val = current === '1' ? '0' : '1'
					}
					this.sendCommand(`SET ${ch} AUDIO_IN_LINE_LVL ${val}`)
				}
			},
		}
	}

	this.setActionDefinitions(actions)
}
