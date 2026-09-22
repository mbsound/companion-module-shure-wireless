/**
 * INTERNAL: initialize variables.
 *
 * @access protected
 * @since 1.0.0
 */
export function updateVariables() {
	let variables = []

	if (this.model.family == 'psm') {
		for (let i = 1; i <= this.model.channels; i++) {
			let prefix = `ch_${i}`
			variables.push({ variableId: `${prefix}_name`, name: `Channel ${i} Name` })
			variables.push({ variableId: `${prefix}_group_chan`, name: `Channel ${i} Group & Channel` })
			variables.push({ variableId: `${prefix}_group`, name: `Channel ${i} Group` })
			variables.push({ variableId: `${prefix}_channel`, name: `Channel ${i} Channel` })
			variables.push({ variableId: `${prefix}_frequency`, name: `Channel ${i} Frequency` })
			variables.push({ variableId: `${prefix}_audio_in_level`, name: `Channel ${i} Audio In Level` })
			variables.push({ variableId: `${prefix}_rf_tx_level`, name: `Channel ${i} RF TX Level` })
			variables.push({ variableId: `${prefix}_rf_mute`, name: `Channel ${i} RF Mute` })
			variables.push({ variableId: `${prefix}_audio_tx_mode`, name: `Channel ${i} Audio TX Mode` })
			variables.push({ variableId: `${prefix}_audio_in_line_level`, name: `Channel ${i} Audio In Line Level` })
			variables.push({ variableId: `${prefix}_audio_in_level_l`, name: `Channel ${i} Audio In Level L` })
			variables.push({ variableId: `${prefix}_audio_in_level_r`, name: `Channel ${i} Audio In Level R` })
			variables.push({ variableId: `${prefix}_meter_rate`, name: `Channel ${i} Meter Rate` })
		}
		variables.push({ variableId: 'device_id', name: 'Device ID / Name' })
		this.setVariableDefinitions(variables)
		return
	}

	for (let i = 1; i <= this.model.channels; i++) {
		let prefix = `ch_${i}`

		variables.push({ variableId: `${prefix}_name`, name: `Channel ${i} Name` })
		variables.push({ variableId: `${prefix}_meter_rate`, name: `Channel ${i} Meter Rate` })
		variables.push({ variableId: `${prefix}_audio_gain`, name: `Channel ${i} Audio Gain` })

		if (this.model.family == 'ad' || this.model.family == 'ulx') {
			variables.push({ variableId: `${prefix}_audio_mute`, name: `Channel ${i} Audio Mute` })
		}

		if (this.model.family == 'ad') {
			variables.push({ variableId: `${prefix}_tx_rf_output`, name: `Channel ${i} Transmitter RF Output` })
		}

		variables.push({ variableId: `${prefix}_group_chan`, name: `Channel ${i} Group & Channel` })
		variables.push({ variableId: `${prefix}_group`, name: `Channel ${i} Group` })
		variables.push({ variableId: `${prefix}_channel`, name: `Channel ${i} Channel` })
		variables.push({ variableId: `${prefix}_frequency`, name: `Channel ${i} Frequency` })

		if (this.model.family != 'slx') {
			variables.push({ variableId: `${prefix}_encryption_status`, name: `Channel ${i} Encryption Status` })
		}

		if (this.model.family == 'ad') {
			variables.push({ variableId: `${prefix}_encryption_mode`, name: `Channel ${i} Encryption Mode` })
		}

		if (this.model.family == 'ad' || this.model.family == 'ulx' || this.model.family == 'slxplus') {
			variables.push({ variableId: `${prefix}_interference_status`, name: `Channel ${i} Interference Status` })
		}

		if (this.model.family == 'slx' || this.model.family == 'slxplus') {
			variables.push({ variableId: `${prefix}_audio_out_lvl_switch`, name: `Channel ${i} Audio Out Level Switch` })
		}

		if (this.model.family == 'slxplus') {
			variables.push({ variableId: `${prefix}_link_status`, name: `Channel ${i} Linked Transmitter Status` })
			variables.push({ variableId: `${prefix}_link_tx_model`, name: `Channel ${i} Linked Transmitter Model` })
			variables.push({
				variableId: `${prefix}_link_tx_batt_mins`,
				name: `Channel ${i} Linked Transmitter Battery Mins`,
			})
			variables.push({
				variableId: `${prefix}_link_tx_batt_runtime`,
				name: `Channel ${i} Linked Transmitter Battery Runtime`,
			})
		}

		if (this.model.family == 'ulx' || this.model.family == 'slxplus') {
			variables.push({ variableId: `${prefix}_na_chan_name`, name: `Channel ${i} Dante Channel Name` })
		}

		if (this.model.family == 'ulx') {
			variables.push({ variableId: `${prefix}_tx_fw_ver`, name: `Channel ${i} Transmitter Firmware Version` })
		}

		if (this.model.family == 'ad') {
			variables.push({ variableId: `${prefix}_unregistered_tx_status`, name: `Channel ${i} Unregistered TX Status` })
			variables.push({ variableId: `${prefix}_fd_mode`, name: `Channel ${i} FD Mode` })
			variables.push({ variableId: `${prefix}_group_chan2`, name: `Channel ${i} Group & Channel 2` })
			variables.push({ variableId: `${prefix}_frequency2`, name: `Channel ${i} Frequency 2` })
			variables.push({ variableId: `${prefix}_interference_status2`, name: `Channel ${i} Interference Status 2` })
		}

		if (this.model.family != 'slx' && this.model.family != 'slxplus') {
			variables.push({ variableId: `${prefix}_antenna`, name: `Channel ${i} Antenna Status` })
		}

		if (this.model.family == 'ad') {
			variables.push({ variableId: `${prefix}_signal_quality`, name: `Channel ${i} Signal Quality` })
			variables.push({ variableId: `${prefix}_rf_level_a`, name: `Channel ${i} RF Level A` })
			variables.push({ variableId: `${prefix}_rf_level_b`, name: `Channel ${i} RF Level B` })
			variables.push({ variableId: `${prefix}_rf_level_c`, name: `Channel ${i} RF Level C` })
			variables.push({ variableId: `${prefix}_rf_level_d`, name: `Channel ${i} RF Level D` })
			variables.push({ variableId: `${prefix}_antenna_f2`, name: `Channel ${i} Antenna Status (Frequency 2, FD-C)` })
			variables.push({ variableId: `${prefix}_rf_level_a_f2`, name: `Channel ${i} RF Level A (Frequency 2, FD-C)` })
			variables.push({ variableId: `${prefix}_rf_level_b_f2`, name: `Channel ${i} RF Level B (Frequency 2, FD-C)` })
			variables.push({ variableId: `${prefix}_audio_level`, name: `Channel ${i} Audio Level RMS` })
			variables.push({ variableId: `${prefix}_audio_level_peak`, name: `Channel ${i} Audio Level Peak` })
		} else if (this.model.family == 'slx' || this.model.family == 'slxplus') {
			variables.push({ variableId: `${prefix}_rf_level`, name: `Channel ${i} RF Level` })
			variables.push({ variableId: `${prefix}_audio_level`, name: `Channel ${i} Audio Level RMS` })
			variables.push({ variableId: `${prefix}_audio_level_peak`, name: `Channel ${i} Audio Level Peak` })
		} else {
			variables.push({ variableId: `${prefix}_rf_level`, name: `Channel ${i} RF Level` })
			variables.push({ variableId: `${prefix}_audio_level`, name: `Channel ${i} Audio Level` })
		}

		variables.push({ variableId: `${prefix}_tx_model`, name: `Channel ${i} Transmitter Model` })

		if (this.model.family != 'slx' && this.model.family != 'slxplus') {
			variables.push({ variableId: `${prefix}_tx_device_id`, name: `Channel ${i} Transmitter Device ID` })
			variables.push({ variableId: `${prefix}_tx_offset`, name: `Channel ${i} Transmitter Offset` })
		}

		if (this.model.family == 'ad') {
			variables.push({ variableId: `${prefix}_tx_input_pad`, name: `Channel ${i} Transmitter Input Pad` })
			variables.push({ variableId: `${prefix}_tx_polarity`, name: `Channel ${i} Transmitter Polarity` })
			variables.push({ variableId: `${prefix}_tx_phantom_power`, name: `Channel ${i} Transmitter Phantom Power` })
			variables.push({ variableId: `${prefix}_tx_hpf`, name: `Channel ${i} Transmitter High Pass Filter` })
			variables.push({ variableId: `${prefix}_antenna_configuration`, name: `Channel ${i} Antenna Configuration` })
		}

		if (this.model.family != 'slx' && this.model.family != 'slxplus') {
			variables.push({ variableId: `${prefix}_tx_power_level`, name: `Channel ${i} Transmitter Power Level` })
			variables.push({ variableId: `${prefix}_tx_mute_status`, name: `Channel ${i} Transmitter Mute Status` })
			variables.push({ variableId: `${prefix}_tx_lock`, name: `Channel ${i} Transmitter Lock` })
			variables.push({ variableId: `${prefix}_tx_power_lock`, name: `Channel ${i} Transmitter Power Lock` })
			variables.push({ variableId: `${prefix}_tx_menu_lock`, name: `Channel ${i} Transmitter Menu Lock` })
		}

		if (this.model.family == 'ulx' || this.model.family == 'qlx') {
			variables.push({ variableId: `${prefix}_tx_power_mode`, name: `Channel ${i} Transmitter Power Mode` })
		}

		if (this.model.family != 'ad' && this.model.family != 'slx' && this.model.family != 'slxplus') {
			variables.push({ variableId: `${prefix}_tx_power_source`, name: `Channel ${i} Transmitter Power Source` })
		}

		if (this.model.family != 'slx' && this.model.family != 'slxplus') {
			variables.push({ variableId: `${prefix}_tx_talk_switch`, name: `Channel ${i} Transmitter Mute Button Status` })
		}

		variables.push({ variableId: `${prefix}_battery_bars`, name: `Channel ${i} Battery Bars` })

		if (this.model.family != 'slx') {
			variables.push({ variableId: `${prefix}_battery_charge`, name: `Channel ${i} Battery Charge Status` })
		}

		if (this.model.family != 'slx') {
			variables.push({ variableId: `${prefix}_battery_cycle`, name: `Channel ${i} Battery Cycle` })
		}

		if (this.model.family == 'ad') {
			variables.push({ variableId: `${prefix}_battery_health`, name: `Channel ${i} Battery Health` })
		}

		variables.push({ variableId: `${prefix}_battery_runtime`, name: `Channel ${i} Battery Run Time` })

		if (this.model.family != 'slx' && this.model.family != 'slxplus') {
			variables.push({ variableId: `${prefix}_battery_temp_f`, name: `Channel ${i} Battery Temperature (F)` })
			variables.push({ variableId: `${prefix}_battery_temp_c`, name: `Channel ${i} Battery Temperature (C)` })
			variables.push({ variableId: `${prefix}_battery_type`, name: `Channel ${i} Battery Type` })
		}

		let maxSlotChannels = this.model.id == 'anx4' ? 16 : this.model.channels
		if (this.model.slots > 0 && i <= maxSlotChannels) {
			for (let j = 1; j <= this.model.slots; j++) {
				let k = j < 10 ? '0' + j : j
				let id = `${i}-${k}`
				prefix = `slot_${id}`
				variables.push({ variableId: `${prefix}_status`, name: `Slot ${id} Status` })
				variables.push({ variableId: `${prefix}_link_status`, name: `Slot ${id} Showlink Status` })
				variables.push({ variableId: `${prefix}_tx_type`, name: `Slot ${id} Transmitter Type` })
				variables.push({ variableId: `${prefix}_tx_model`, name: `Slot ${id} Transmitter Model` })
				variables.push({ variableId: `${prefix}_tx_device_id`, name: `Slot ${id} Transmitter Device ID` })
				variables.push({ variableId: `${prefix}_tx_offset`, name: `Slot ${id} Transmitter Offset` })
				variables.push({ variableId: `${prefix}_tx_input_pad`, name: `Slot ${id} Transmitter Input Pad` })
				variables.push({ variableId: `${prefix}_tx_phantom_power`, name: `Slot ${id} Transmitter Phantom Power` })
				variables.push({ variableId: `${prefix}_tx_hpf`, name: `Slot ${id} Transmitter High Pass Filter` })
				variables.push({ variableId: `${prefix}_tx_polarity`, name: `Slot ${id} Transmitter Polarity` })
				variables.push({ variableId: `${prefix}_tx_power_level`, name: `Slot ${id} Transmitter Power Level` })
				variables.push({ variableId: `${prefix}_tx_power_mode`, name: `Slot ${id} Transmitter Power Mode` })
				variables.push({ variableId: `${prefix}_tx_rf_output`, name: `Slot ${id} Transmitter RF Output` })
				variables.push({ variableId: `${prefix}_rf_output`, name: `Slot ${id} RF Output` })
				variables.push({ variableId: `${prefix}_battery_bars`, name: `Slot ${id} Battery Bars` })
				variables.push({ variableId: `${prefix}_battery_charge`, name: `Slot ${id} Battery Charge Status` })
				variables.push({ variableId: `${prefix}_battery_cycle`, name: `Slot ${id} Battery Cycle` })
				variables.push({ variableId: `${prefix}_battery_health`, name: `Slot ${id} Battery Health` })
				variables.push({ variableId: `${prefix}_battery_runtime`, name: `Slot ${id} Battery Run Time` })
				variables.push({ variableId: `${prefix}_battery_type`, name: `Slot ${id} Battery Type` })
			}
		}
	}

	variables.push({ variableId: 'device_id', name: 'Device ID' })

	if (this.model.id == 'ulxd4d' || this.model.id == 'ulxd4q') {
		variables.push({ variableId: 'audio_summing_mode', name: 'Audio Summing Mode' })
		variables.push({ variableId: 'frequency_diversity_mode', name: 'Frequency Diversity Mode' })
	}

	if (this.model.family == 'ulx' || this.model.family == 'ad') {
		variables.push({ variableId: 'high_density_mode', name: 'High Density Mode' })
	}

	if (this.model.id == 'anx4') {
		variables.push({ variableId: 'number_channels_licensed', name: 'Number of Channels Licensed' })
		variables.push({ variableId: 'available_channels', name: 'Available Channels' })
		variables.push({ variableId: 'transmission_mode', name: 'Transmission Mode' })
	}

	if (this.model.family == 'ad' || this.model.family == 'slx' || this.model.family == 'slxplus') {
		variables.push({ variableId: 'model', name: 'Receiver Model' })
		variables.push({ variableId: 'rf_band', name: 'RF Band' })
	}

	if (this.model.family == 'ad') {
		variables.push({ variableId: 'quadversity_mode', name: 'Quadversity Mode' })
	}

	if (this.model.family != 'slx') {
		variables.push({ variableId: 'encryption', name: 'Encryption' })
	}

	variables.push({ variableId: 'firmware_version', name: 'Firmware Version' })

	if (this.model.family == 'slx' || this.model.family == 'slxplus') {
		variables.push({ variableId: 'lock_status', name: 'Lock Status' })
	}

	if (this.model.family == 'ulx') {
		variables.push({ variableId: 'scan_lock', name: 'Scan Lock' })
		variables.push({ variableId: 'sync_lock', name: 'Sync Lock' })
	}

	if (this.model.family == 'ulx' || this.model.family == 'slxplus') {
		variables.push({ variableId: 'na_device_name', name: 'Dante Device Name' })
	}

	if (this.model.family == 'slxplus') {
		variables.push({ variableId: 'app_conn_enabled', name: 'App Connection Enabled' })
	}

	this.setVariableDefinitions(variables)
}
