function CreateModelChoices() {
	let choices = Object.values(Models)
	// Sort alphabetical
	choices.sort(function (a, b) {
		let x = a.label.toLowerCase()
		let y = b.label.toLowerCase()
		if (x < y) {
			return -1
		}
		if (x > y) {
			return 1
		}
		return 0
	})

	return choices
}

export const Models = {
	ulxd4: { id: 'ulxd4', family: 'ulx', label: 'ULXD4 Single Receiver', channels: 1, slots: 0 },
	ulxd4d: { id: 'ulxd4d', family: 'ulx', label: 'ULXD4D Dual Receiver', channels: 2, slots: 0 },
	ulxd4q: { id: 'ulxd4q', family: 'ulx', label: 'ULXD4Q Quad Receiver', channels: 4, slots: 0 },
	qlxd4: { id: 'qlxd4', family: 'qlx', label: 'QLXD4 Single Receiver', channels: 1, slots: 0 },
	ad4d: { id: 'ad4d', family: 'ad', label: 'AD4D Dual Receiver', channels: 2, slots: 8 },
	ad4q: { id: 'ad4q', family: 'ad', label: 'AD4Q Quad Receiver', channels: 4, slots: 8 },
	slxd4: { id: 'slxd4', family: 'slx', label: 'SLXD4 Single Receiver', channels: 1, slots: 0 },
	slxd4d: { id: 'slxd4d', family: 'slx', label: 'SLXD4D Dual Receiver', channels: 2, slots: 0 },
	slxd4plus: { id: 'slxd4plus', family: 'slxplus', label: 'SLXD4+ Single Receiver', channels: 1, slots: 0 },
	slxd4dplus: { id: 'slxd4dplus', family: 'slxplus', label: 'SLXD4D+ Dual Receiver', channels: 2, slots: 0 },
	slxd5: { id: 'slxd5', family: 'slxplus', label: 'SLXD5 Portable Receiver', channels: 1, slots: 0 },
	psm1000: { id: 'psm1000', family: 'psm', label: 'PSM1000 Dual Transmitter', channels: 2, slots: 0 },
	anx4: { id: 'anx4', family: 'ad', label: 'ANX4 Multi-Channel Receiver (up to 24 Ch)', channels: 24, slots: 8 },
}

export const Choices = {
	Models: CreateModelChoices(),
	OnOffToggle: [
		{ id: 'ON', label: 'Mute' },
		{ id: 'OFF', label: 'Unmute' },
		{ id: 'TOGGLE', label: 'Toggle Mute/Unmute' },
	],
	RfOutput: [
		{ id: 'RF_ON', label: 'RF On' },
		{ id: 'RF_MUTE', label: 'RF Mute' },
		{ id: 'TOGGLE', label: 'Toggle RF Mute/Unmute' },
	],
	RfPower: [
		{ id: 'LOW', label: 'Low' },
		{ id: 'NORMAL', label: 'Normal' },
		{ id: 'HIGH', label: 'High' },
	],
	SlotStatus: [
		{ id: 'EMPTY', label: 'Empty' },
		{ id: 'STANDARD', label: 'Standard' },
		{ id: 'LINKED.INACTIVE', label: 'Linked - Inactive' },
		{ id: 'LINKED.ACTIVE', label: 'Linked - Active' },
	],
	HighDensity: [
		{ id: 'ON', label: 'High Density On' },
		{ id: 'OFF', label: 'High Density Off' },
		{ id: 'TOGGLE', label: 'Toggle High Density' },
	],
	TransmissionMode: [
		{ id: 'STANDARD', label: 'Standard Mode' },
		{ id: 'HIGH_DENSITY', label: 'High Density Mode' },
		{ id: 'TOGGLE', label: 'Toggle Mode' },
	],
	AudioSumming: [
		{ id: 'OFF', label: 'Off' },
		{ id: '1+2', label: '1+2' },
		{ id: '3+4', label: '3+4' },
		{ id: '1+2/3+4', label: '1+2 / 3+4' },
		{ id: '1+2+3+4', label: '1+2+3+4' },
	],
	FrequencyDiversity: [
		{ id: 'OFF', label: 'Off' },
		{ id: '1+2', label: '1+2' },
		{ id: '3+4', label: '3+4' },
		{ id: '1+2/3+4', label: '1+2 / 3+4' },
	],
	EncryptionMode: [
		{ id: 'OFF', label: 'Off' },
		{ id: 'MANUAL', label: 'Manual' },
		{ id: 'AUTO', label: 'Auto' },
	],
	LockState: [
		{ id: 'ON', label: 'Locked' },
		{ id: 'OFF', label: 'Unlocked' },
		{ id: 'TOGGLE', label: 'Toggle Lock' },
	],
	SlotInputPad: [
		{ id: '0', label: 'Pad Off (0 dB)' },
		{ id: '12', label: 'Pad On (-12 dB)' },
		{ id: 'TOGGLE', label: 'Toggle Pad' },
	],
	SlotPolarity: [
		{ id: 'POSITIVE', label: 'Positive' },
		{ id: 'NEGATIVE', label: 'Negative' },
		{ id: 'TOGGLE', label: 'Toggle Polarity' },
	],
	MicLine: [
		{ id: 'MIC', label: 'Mic Level' },
		{ id: 'LINE', label: 'Line Level' },
	],
	LinkStatus: [
		{ id: 'EMPTY', label: 'Empty' },
		{ id: 'LINKED.INACTIVE', label: 'Linked - Inactive' },
		{ id: 'LINKED.ACTIVE', label: 'Linked - Active' },
	],
	QualityThreshold: [
		{ id: 1, label: 'Quality <= 1 (Poor)' },
		{ id: 2, label: 'Quality <= 2 (Marginal)' },
		{ id: 3, label: 'Quality <= 3 (Fair)' },
		{ id: 4, label: 'Quality <= 4 (Good)' },
		{ id: 5, label: 'Quality <= 5 (Excellent)' },
	],
	PsmRfTxLevel: [
		{ id: '10', label: '10 mW' },
		{ id: '50', label: '50 mW' },
		{ id: '100', label: '100 mW' },
	],
	PsmAudioTxMode: [
		{ id: '1', label: 'Mono' },
		{ id: '2', label: 'Point to Point' },
		{ id: '3', label: 'Stereo' },
	],
	PsmAudioInLineLevel: [
		{ id: '0', label: 'Aux (-10 dBV)' },
		{ id: '1', label: 'Line (+4 dBu)' },
		{ id: 'TOGGLE', label: 'Toggle Line/Aux' },
	],
	PsmRfMute: [
		{ id: '0', label: 'Unmute' },
		{ id: '1', label: 'Mute' },
		{ id: 'TOGGLE', label: 'Toggle Mute/Unmute' },
	],
	TxPhantomPower: [
		{ id: '0000', label: 'Off' },
		{ id: '012', label: '+12V' },
		{ id: '048', label: '+48V' },
	],
	TxHighPassFilter: [
		{ id: '000', label: 'Off' },
		{ id: '040', label: '40 Hz' },
		{ id: '080', label: '80 Hz' },
		{ id: '160', label: '160 Hz' },
		{ id: '240', label: '240 Hz' },
	],
	AntennaConfiguration: [
		{ id: 'AUTOMATIC', label: 'Automatic' },
		{ id: 'AB', label: 'Antenna AB' },
		{ id: 'CD', label: 'Antenna CD' },
		{ id: 'QUADVERSITY', label: 'Quadversity' },
	],
}

export const Regex = {
	Frequency: '/^\\d{3,4}\\.\\d{3}$/',
	Name: '/^.{1,31}$/',
	GroupChan: '/^([0-9]{1,2}|--),([0-9]{1,2}|--)$/',
	PsmGainSet: { range: { min: -67, max: 0 } },
	PsmGainIncrement: { range: { min: 1, max: 67 } },
}

export const Fields = {
	BatteryLevel: {
		type: 'number',
		label: 'Battery Alert Level',
		id: 'barlevel',
		min: 1,
		max: 5,
		default: 2,
		required: true,
		range: true,
	},
	Frequency: {
		type: 'textinput',
		label: 'Frequency (MHz)',
		id: 'value',
		default: '470.000',
		useVariables: true,
		// regex: '/^(4[7-9][0-9]|[5-8][0-9]{2}|9[0-2][0-9]|93[0-7])\\.\\d(00|25|50|75)$/',
	},
	GainIncrement: {
		type: 'textinput',
		//		type: 'number',
		label: 'Gain Value (dB)',
		id: 'gain',
		min: 1,
		max: 60,
		default: 3,
		useVariables: true,
		required: true,
		range: true,
	},
	GainSet: {
		type: 'textinput',
		//		type: 'number',
		label: 'Gain Value (dB)',
		id: 'gain',
		min: -18,
		max: 42,
		default: 0,
		useVariables: true,
		required: true,
		range: true,
	},
	Mute: {
		type: 'dropdown',
		label: 'Mute/Unmute/Toggle',
		id: 'choice',
		default: 'ON',
		choices: Choices.OnOffToggle,
	},
	Name: {
		type: 'textinput',
		label: 'Name (up to 31 chars for AD/SLX, 8 for ULX/QLX)',
		id: 'name',
		default: '',
		useVariables: true,
		// regex: '/^.{1,8}$/',
	},
	DeviceId: {
		type: 'textinput',
		label: 'Device ID / Name',
		id: 'name',
		default: '',
		useVariables: true,
	},
	Group: {
		type: 'textinput',
		label: 'Group (1-99 or --)',
		id: 'group',
		default: '1',
		useVariables: true,
	},
	ChannelNum: {
		type: 'textinput',
		label: 'Channel (1-99 or --)',
		id: 'channel_num',
		default: '1',
		useVariables: true,
	},
	RfOutput: {
		type: 'dropdown',
		label: 'On/Off/Toggle',
		id: 'onoff',
		default: 'RF_ON',
		choices: Choices.RfOutput,
	},
	RfPower: {
		type: 'dropdown',
		label: 'Power Level',
		id: 'power',
		default: 'NORMAL',
		choices: Choices.RfPower,
	},
	SlotStatus: {
		type: 'dropdown',
		label: 'Status',
		id: 'value',
		default: 'LINKED.ACTIVE',
		choices: Choices.SlotStatus,
	},
	HighDensity: {
		type: 'dropdown',
		label: 'High Density Mode',
		id: 'mode',
		default: 'ON',
		choices: Choices.HighDensity,
	},
	TransmissionMode: {
		type: 'dropdown',
		label: 'Transmission Mode',
		id: 'mode',
		default: 'HIGH_DENSITY',
		choices: Choices.TransmissionMode,
	},
	AudioSumming: {
		type: 'dropdown',
		label: 'Audio Summing Mode',
		id: 'mode',
		default: 'OFF',
		choices: Choices.AudioSumming,
	},
	FrequencyDiversity: {
		type: 'dropdown',
		label: 'Frequency Diversity Mode',
		id: 'mode',
		default: 'OFF',
		choices: Choices.FrequencyDiversity,
	},
	EncryptionMode: {
		type: 'dropdown',
		label: 'Encryption Mode',
		id: 'mode',
		default: 'MANUAL',
		choices: Choices.EncryptionMode,
	},
	LockState: {
		type: 'dropdown',
		label: 'Lock State',
		id: 'state',
		default: 'ON',
		choices: Choices.LockState,
	},
	SlotInputPad: {
		type: 'dropdown',
		label: 'Input Pad',
		id: 'pad',
		default: '12',
		choices: Choices.SlotInputPad,
	},
	SlotPolarity: {
		type: 'dropdown',
		label: 'Polarity',
		id: 'polarity',
		default: 'NEGATIVE',
		choices: Choices.SlotPolarity,
	},
	SlotOffsetSet: {
		type: 'textinput',
		label: 'Offset Value (-12 to +21 dB)',
		id: 'offset',
		default: '0',
		useVariables: true,
	},
	SlotOffsetInc: {
		type: 'textinput',
		label: 'Offset Increment (dB)',
		id: 'offset',
		default: '1',
		useVariables: true,
	},
	MicLine: {
		type: 'dropdown',
		label: 'Mic/Line Switch Level',
		id: 'level',
		default: 'MIC',
		choices: Choices.MicLine,
	},
	LinkStatus: {
		type: 'dropdown',
		label: 'Linked Transmitter Status',
		id: 'status',
		default: 'LINKED.ACTIVE',
		choices: Choices.LinkStatus,
	},
	QualityThreshold: {
		type: 'dropdown',
		label: 'Signal Quality Threshold',
		id: 'threshold',
		default: 2,
		choices: Choices.QualityThreshold,
	},
	AudioPeakThreshold: {
		type: 'number',
		label: 'Audio Peak Threshold (dBFS)',
		id: 'threshold',
		min: -50,
		max: 0,
		default: -6,
		required: true,
	},
	PsmGainSet: {
		type: 'textinput',
		label: 'Audio In Level (-67 to 0 dB)',
		id: 'gain',
		default: '-16',
		useVariables: true,
		required: true,
	},
	PsmGainIncrement: {
		type: 'textinput',
		label: 'Gain Value (dB)',
		id: 'gain',
		default: '1',
		useVariables: true,
		required: true,
	},
	PsmRfTxLevel: {
		type: 'dropdown',
		label: 'RF Level (mW)',
		id: 'level',
		default: '10',
		choices: Choices.PsmRfTxLevel,
	},
	PsmAudioTxMode: {
		type: 'dropdown',
		label: 'Audio TX Mode',
		id: 'mode',
		default: '3',
		choices: Choices.PsmAudioTxMode,
	},
	PsmAudioInLineLevel: {
		type: 'dropdown',
		label: 'Audio Input Line Level',
		id: 'level',
		default: '1',
		choices: Choices.PsmAudioInLineLevel,
	},
	PsmRfMute: {
		type: 'dropdown',
		label: 'Mute/Unmute/Toggle',
		id: 'choice',
		default: '1',
		choices: Choices.PsmRfMute,
	},
	TxPhantomPower: {
		type: 'dropdown',
		label: 'Phantom Power',
		id: 'value',
		default: '0000',
		choices: Choices.TxPhantomPower,
	},
	TxHighPassFilter: {
		type: 'dropdown',
		label: 'High Pass Filter',
		id: 'value',
		default: '000',
		choices: Choices.TxHighPassFilter,
	},
	AntennaConfiguration: {
		type: 'dropdown',
		label: 'Antenna Configuration',
		id: 'value',
		default: 'AUTOMATIC',
		choices: Choices.AntennaConfiguration,
	},
}
