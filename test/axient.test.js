// The AD4D/AD4Q/ANX4 backend against the reference's simulated units, over real UDP (ACN) and
// TCP (2202) on loopback.

import test from 'node:test'
import assert from 'node:assert/strict'
import { CH, KEY, chanAddr } from '../src/driver/ad4q/properties.js'
import { axientOnFake, delay, lastStatus, until } from './helpers.js'

const held = (fake, channel, obj) => fake.store.get(chanAddr(channel, obj)).value

test('AD4Q: connects, reads every channel, and reports OK once the control port is up', async (t) => {
	const { inst } = await axientOnFake(t)
	await until(() => lastStatus(inst) === 'ok', 6000, 'status ok')
	const v = inst.variables
	assert.equal(v.ch_1_name, 'Channel1')
	assert.equal(v.ch_4_name, 'Channel4')
	assert.equal(v.ch_1_audio_gain, '0 dB')
	assert.equal(v.ch_2_frequency, '520.000 MHz')
	assert.equal(v.ch_1_fd_mode, 'FD-S')
	assert.equal(v.model, 'AD4Q-A')
	assert.equal(v.rf_band, 'G57')
	assert.equal(v.encryption, 'OFF')
	assert.equal(inst.api.getReceiver().highDensity, 'OFF')
})

test('AD4Q: gain is clamped, stepped from the held value, and read back from the unit', async (t) => {
	const { inst, fake, backend } = await axientOnFake(t)
	await until(() => inst.variables.ch_1_audio_gain, 6000, 'gain')
	await backend.setGain(1, 99)
	assert.equal(held(fake, 1, CH.GAIN_DB).readInt8(0), 42)
	await until(() => inst.variables.ch_1_audio_gain === '+42 dB', 2000, 'gain read-back')
	await backend.stepGain(1, -5)
	assert.equal(held(fake, 1, CH.GAIN_DB).readInt8(0), 37)
	await backend.setGain(0, -30)
	for (let c = 1; c <= 4; c += 1) assert.equal(held(fake, c, CH.GAIN_DB).readInt8(0), -18, `channel ${c}`)
})

test('AD4Q: mute toggles, names are cut to eight characters, frequencies snap to 25 kHz', async (t) => {
	const { inst, fake, backend } = await axientOnFake(t)
	await until(() => inst.variables.ch_1_audio_mute, 6000, 'mute')
	await backend.setMute(1, 'TOGGLE')
	await until(() => inst.variables.ch_1_audio_mute === 'ON', 2000, 'mute on')
	await backend.setMute(1, 'TOGGLE')
	await until(() => inst.variables.ch_1_audio_mute === 'OFF', 2000, 'mute off')
	await backend.setChannelName(2, 'LeadVocal99')
	await until(() => inst.variables.ch_2_name === 'LeadVoca', 2000, 'name')
	await backend.setFrequency(3, 600.013)
	assert.equal(held(fake, 3, CH.FREQ_KHZ).readUInt32BE(0), 600_025)
	await until(() => inst.variables.ch_3_frequency === '600.025 MHz', 2000, 'frequency')
})

test('AD4Q: transmitter, slot and status reports from the control port reach the variables', async (t) => {
	const { inst, fake } = await axientOnFake(t)
	await until(() => lastStatus(inst) === 'ok', 6000, 'status ok')
	await until(() => fake.commands.gets.length > 40, 6000, 'first control-port read')
	fake.commands.receiveTransmitter(1, { model: 'ADX2', deviceId: 'LeadVox', batteryPercent: 88, batteryMinutes: 125 })
	await until(() => inst.variables.ch_1_tx_model === 'ADX2', 2000, 'tx model')
	assert.equal(inst.variables.ch_1_tx_device_id, 'LeadVox')
	assert.equal(inst.variables.ch_1_battery_charge, '088%')
	assert.equal(inst.variables.ch_1_battery_runtime, '2:05')
	fake.commands.setSlot(1, 2, { status: 'LINKED.ACTIVE', showLink: 5, model: 'ADX2' })
	await until(() => inst.api.getSlot(1, 2).status === 'LINKED.ACTIVE', 2000, 'slot status')
	fake.commands.setStatus(2, 'INTERFERENCE_STATUS', 'DETECTED')
	await until(() => inst.variables.ch_2_interference_status === 'DETECTED', 2000, 'interference')
})

test('AD4Q: the control port gets one request at a time, never a burst', async (t) => {
	const { inst, fake, chunks } = await axientOnFake(t)
	await until(() => lastStatus(inst) === 'ok', 6000, 'status ok')
	// wait for the whole first read and the meter-rate settings to finish
	await until(() => chunks.join('').includes('METER_RATE'), 15_000, 'metering set')
	await delay(200)
	const frames = (chunk) => (chunk.match(/</g) ?? []).length
	assert.ok(
		fake.commands.gets.length > 50,
		`expected the first read to be thorough (${fake.commands.gets.length} GETs)`
	)
	assert.equal(Math.max(...chunks.map(frames)), 1, 'more than one request was in flight at once')
	assert.ok(!chunks.join('').includes('GET 0 ALL'), 'GET 0 ALL is not used')
})

test('AD4Q: closing sets every channel’s meter rate back to 0', async (t) => {
	const { inst, fake, backend } = await axientOnFake(t)
	await until(() => Object.keys(fake.commands.meterTimers).length === 4, 15_000, 'SAMPLE streaming')
	await until(
		() => typeof inst.api.getChannel(1).signalQuality === 'number' && inst.variables.ch_1_signal_quality !== undefined,
		3000,
		'quality'
	)
	await backend.stop()
	assert.deepEqual(Object.keys(fake.commands.meterTimers), [], 'the unit was left streaming SAMPLE lines')
})

test('AD4Q: ACN meters are published at the metering interval', async (t) => {
	const { inst } = await axientOnFake(t, { metering: { meteringInterval: 150 } })
	await until(() => inst.variables.ch_1_rf_level_a, 6000, 'rf level')
	assert.match(inst.variables.ch_1_rf_level_a, /^-\d+\.\d dBm$/)
	assert.match(inst.variables.ch_1_audio_level, /^-?\d+ dBFS$/)
})

test('AD4Q: with metering off, no meter variables are published and the unit sends no SAMPLE lines', async (t) => {
	const { inst, fake } = await axientOnFake(t, { metering: { meteringOn: false } })
	await until(() => lastStatus(inst) === 'ok', 6000, 'status ok')
	await until(() => fake.commands.gets.length > 40, 6000, 'first control-port read')
	await delay(800)
	assert.equal(inst.variables.ch_1_rf_level_a, undefined)
	assert.equal(inst.variables.ch_1_signal_quality, undefined)
	assert.deepEqual(Object.keys(fake.commands.meterTimers), [])
})

test('AD4Q: with the control port unavailable, ACN still works and the status says what is missing', async (t) => {
	const { inst } = await axientOnFake(t, { commandPort: false })
	await until(() => lastStatus(inst) === 'unknown_warning', 6000, 'warning status')
	assert.match(inst.statuses.at(-1).message, /command port .* unavailable/)
	assert.equal(inst.variables.ch_1_name, 'Channel1')
})

test('AD4D: two channels, and a committed SET answered without an address still reads back', async (t) => {
	const { inst, fake, backend } = await axientOnFake(t, { model: 'AD4D' })
	await until(() => inst.variables.ch_2_name, 6000, 'channel 2')
	assert.equal(inst.variables.ch_3_name, undefined)
	await backend.setGain(2, 12)
	assert.equal(held(fake, 2, CH.GAIN_DB).readInt8(0), 12)
	await until(() => inst.variables.ch_2_audio_gain === '+12 dB', 2000, 'gain read-back')
})

test('ANX4: counts its licensed channels, reads its mode and antenna pairs, and writes an antenna pair', async (t) => {
	const ctx = await axientOnFake(t, { model: 'ANX4', channels: 16 })
	const { inst, fake, backend } = ctx
	await until(() => ctx.licensedChannels === 16, 8000, 'licence count')
	await until(() => inst.variables.ch_16_name === 'Ch.16', 8000, 'channel 16')
	// the mode and the antenna pairs are string-keyed values, read after the channel properties
	await until(() => inst.variables.transmission_mode, 4000, 'transmission mode')
	assert.equal(inst.variables.number_channels_licensed, 16)
	assert.equal(inst.variables.transmission_mode, 'AD_STANDARD')
	assert.equal(inst.variables.ch_5_antenna_configuration, 'AB')
	assert.equal(inst.variables.rf_band, 'G57+')
	await backend.setAntenna(5, 'CD')
	assert.equal(fake.anxKeys.get(KEY.antennaSelection(5))[0], 1)
	await until(() => inst.variables.ch_5_antenna_configuration === 'CD', 2000, 'antenna read-back')
	// AUTOMATIC has no documented write: refused locally, nothing sent
	const writes = fake.writes.length
	await backend.setAntenna(5, 'AUTOMATIC')
	assert.equal(fake.writes.length, writes)
})

test('ANX4: SAMPLE lines for two-digit channels are decoded', async (t) => {
	const { inst, fake } = await axientOnFake(t, { model: 'ANX4', channels: 16 })
	await until(() => Object.keys(fake.commands.meterTimers).length === 16, 20_000, 'SAMPLE streaming on 16 channels')
	fake.commands.quality[12] = 4
	await until(() => inst.variables.ch_12_signal_quality === 4, 3000, 'channel 12 quality')
})

test('AD4Q: command-strings actions (ShowLink slots, flash) go out on the control port as one SET', async (t) => {
	const { inst, fake, backend, chunks } = await axientOnFake(t)
	await until(() => lastStatus(inst) === 'ok', 6000, 'status ok')
	await until(() => chunks.join('').includes('METER_RATE'), 15_000, 'first read done')
	await backend.sendLine('SET FLASH ON')
	assert.deepEqual(fake.commands.flashes, [null])
	void backend.sendLine('SET 1 SLOT_RF_OUTPUT 0 RF_MUTE')
	await until(() => chunks.some((c) => c.includes('< SET 1 SLOT_RF_OUTPUT 0 RF_MUTE >')), 2000, 'slot SET sent')
	// reads are the backend's own: a GET handed in from outside is refused, not sent
	const gets = fake.commands.gets.length
	await backend.sendLine('GET 1 TX_MODEL')
	assert.equal(fake.commands.gets.length, gets)
	assert.ok(inst.logs.some((l) => /not sent \(not a SET\)/.test(l)))
})

test('AD4Q: talk-switch routing is read, set per output and position, toggled, and read back', async (t) => {
	const { inst, fake, backend } = await axientOnFake(t)
	await until(() => inst.variables.ch_1_talk_normal, 6000, 'talk routing')
	// a fresh unit routes every output in both positions
	assert.equal(inst.variables.ch_1_talk_normal, 'XLR, TRS, AES3, Dante')
	assert.equal(inst.variables.ch_1_talk_pressed, 'XLR, TRS, AES3, Dante')
	await backend.setTalkRouting(1, 'dantePressed', 'OFF')
	// one bit changes, the others are left as they were (a set bit means that routing is off)
	assert.equal(held(fake, 1, CH.TALK_ROUTING)[0], 0b1000_0000)
	await until(() => inst.variables.ch_1_talk_pressed === 'XLR, TRS, AES3', 2000, 'read-back')
	assert.equal(inst.api.getChannel(1).talk.dantePressed, false)
	await backend.setTalkRouting(1, 'dantePressed', 'TOGGLE')
	assert.equal(held(fake, 1, CH.TALK_ROUTING)[0], 0)
	await backend.setTalkRouting(0, 'xlrNormal', 'OFF')
	for (let c = 1; c <= 4; c += 1) assert.equal(held(fake, c, CH.TALK_ROUTING)[0], 0b0000_0001, `channel ${c}`)
	await until(() => inst.variables.ch_4_talk_normal === 'TRS, AES3, Dante', 2000, 'all channels')
})

test('AD4Q: the firmware version comes from the ACN session', async (t) => {
	const { inst } = await axientOnFake(t, { firmware: '1.5.4.0' })
	await until(() => inst.variables.firmware_version, 6000, 'firmware')
	assert.equal(inst.variables.firmware_version, '1.5.4.0')
})

test('ANX4 below firmware 1.2: no string-keyed requests; licence counted from names, antenna not set', async (t) => {
	const ctx = await axientOnFake(t, { model: 'ANX4', channels: 16, firmware: '1.1.7.0' })
	const { inst, fake, backend } = ctx
	await until(() => ctx.licensedChannels === 16, 8000, 'licence counted from channel names')
	await until(() => inst.variables.ch_16_name === 'Ch.16', 8000, 'channel 16')
	assert.equal(backend.unit.stringKeys, false)
	assert.equal(inst.variables.transmission_mode, undefined)
	assert.equal(inst.variables.ch_5_antenna_configuration, undefined)
	const writes = fake.writes.length
	await backend.setAntenna(5, 'CD')
	assert.equal(fake.writes.length, writes, 'an antenna write went to pre-1.2 firmware')
	assert.ok(inst.logs.some((l) => /does not take this setting over the network/.test(l)))
})

test('a unit that drops the session twice within the window is stood down, then reconnected', async (t) => {
	const { inst, backend } = await axientOnFake(t, { timings: { lossWindowMs: 60_000, standDownMs: 2500 } })
	await until(() => lastStatus(inst) === 'ok', 6000, 'connected')
	backend.unit.emit('lost', new Error('the unit ended the session'))
	// the first loss reconnects after the normal backoff
	await until(() => lastStatus(inst) === 'ok' && backend.unit?.connected, 8000, 'reconnected after one loss')
	backend.unit.emit('lost', new Error('the unit ended the session'))
	assert.equal(lastStatus(inst), 'connection_failure')
	assert.match(inst.statuses.at(-1).message, /Standing down/)
	await delay(1500)
	assert.equal(backend.unit, null, 'reconnected during the stand-down')
	assert.equal(backend.commands, null, 'the control port stayed open during the stand-down')
	await until(() => lastStatus(inst) === 'ok' && backend.unit?.connected, 8000, 'back after the stand-down')
})

test('AD4Q: the tone generator: level, the one-press switch, frequency, all read back from the unit', async (t) => {
	const { inst, fake, backend } = await axientOnFake(t)
	await until(() => inst.variables.ch_1_tone_level, 6000, 'tone state')
	// a fresh unit: the tone is off (the unit holds -128) at 400 Hz
	assert.equal(inst.variables.ch_1_tone_level, 'Off')
	assert.equal(inst.variables.ch_1_tone_frequency, '400 Hz')

	await backend.setToneLevel(1, '-42')
	assert.equal(held(fake, 1, CH.TONE_LEVEL_DB).readInt8(0), -42)
	await until(() => inst.variables.ch_1_tone_level === '-42 dB', 2000, 'level read-back')

	// the one-press switch toggles between Off and -30 dB
	await backend.setToneGenerator(1, 'TOGGLE')
	assert.equal(held(fake, 1, CH.TONE_LEVEL_DB).readInt8(0), -128)
	await until(() => inst.api.getChannel(1).toneLevelDb === null, 2000, 'off read-back')
	await backend.setToneGenerator(1, 'TOGGLE')
	assert.equal(held(fake, 1, CH.TONE_LEVEL_DB).readInt8(0), -30)
	await backend.setToneGenerator(0, 'OFF')
	for (let c = 1; c <= 4; c += 1) assert.equal(held(fake, c, CH.TONE_LEVEL_DB).readInt8(0), -128, `channel ${c}`)

	// a level off the 6 dB grid is not sent
	const writes = fake.writes.length
	await backend.setToneLevel(2, '-40')
	assert.equal(fake.writes.length, writes)

	// frequency is clamped to 20-20000 Hz
	await backend.setToneFrequency(3, 50_000)
	assert.equal(held(fake, 3, CH.TONE_FREQ_HZ).readUInt16BE(0), 20_000)
	await until(() => inst.variables.ch_3_tone_frequency === '20000 Hz', 2000, 'frequency read-back')
	await backend.setToneFrequency(3, 1000)
	assert.equal(held(fake, 3, CH.TONE_FREQ_HZ).readUInt16BE(0), 1000)
})

test('AD4Q: the tone feedbacks follow the unit', async (t) => {
	const ctx = await axientOnFake(t)
	const { inst, backend } = ctx
	await until(() => inst.variables.ch_2_tone_level, 6000, 'tone state')
	const { updateFeedbacks } = await import('../src/feedback.js')
	inst.CHANNELS_FIELD = { type: 'dropdown', id: 'channel', default: '1', choices: [] }
	inst.SLOTS_FIELD = { type: 'dropdown', id: 'slot', default: '1:1', choices: [] }
	inst.setFeedbackDefinitions = (d) => (inst.feedbacks = d)
	updateFeedbacks.call(inst)
	const fb = (id, options) => inst.feedbacks[id].callback({ options })
	assert.equal(fb('tone_generator', { channel: '2' }), false)
	assert.equal(fb('tone_level', { channel: '2', level: 'OFF' }), true)
	await backend.setToneGenerator(2, 'ON')
	await until(() => inst.api.getChannel(2).toneLevelDb === -30, 2000, 'tone on')
	assert.equal(fb('tone_generator', { channel: '2' }), true)
	assert.equal(fb('tone_level', { channel: '2', level: '-30' }), true)
	assert.equal(fb('tone_level', { channel: '2', level: 'OFF' }), false)
})
