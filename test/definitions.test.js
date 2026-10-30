// Every model's actions, feedbacks and variables build, and the AD actions keep their IDs.

import test from 'node:test'
import assert from 'node:assert/strict'
import { updateActions } from '../src/actions.js'
import { updateFeedbacks } from '../src/feedback.js'
import { updateVariables } from '../src/variables.js'
import { Models } from '../src/setup.js'
import { fakeInstance } from './helpers.js'

function definitionsFor(modelId) {
	const inst = fakeInstance(modelId)
	inst.CHOICES_CHANNELS = []
	inst.CHOICES_CHANNELS_A = []
	inst.CHOICES_SLOTS = []
	inst.CHOICES_SLOTS_A = []
	inst.CHANNELS_FIELD = { type: 'dropdown', id: 'channel', default: '1', choices: [] }
	inst.CHANNELS_A_FIELD = { type: 'dropdown', id: 'channel', default: '1', choices: [] }
	inst.SLOTS_FIELD = { type: 'dropdown', id: 'slot', default: '1:1', choices: [] }
	inst.SLOTS_A_FIELD = { type: 'dropdown', id: 'slot', default: '1:1', choices: [] }
	inst.setupChannelChoices = () => {}
	inst.setActionDefinitions = (d) => (inst.actions = d)
	inst.setFeedbackDefinitions = (d) => (inst.feedbacks = d)
	inst.setVariableDefinitions = (d) => (inst.variableDefs = d)
	updateActions.call(inst)
	updateFeedbacks.call(inst)
	updateVariables.call(inst)
	return inst
}

for (const modelId of Object.keys(Models)) {
	test(`${modelId}: definitions build, and every option is defined`, () => {
		const inst = definitionsFor(modelId)
		for (const [id, def] of [...Object.entries(inst.actions), ...Object.entries(inst.feedbacks)]) {
			for (const option of def.options) assert.ok(option && option.id, `${id} has an undefined option`)
		}
		assert.ok(inst.variableDefs.length > 0)
	})
}

test('AD4Q keeps the action IDs existing buttons use; transmission mode is no longer writable', () => {
	const ids = Object.keys(definitionsFor('ad4q').actions)
	for (const id of [
		'set_channel_name',
		'set_device_id',
		'set_group_chan',
		'channel_mute',
		'channel_setaudiogain',
		'channel_increasegain',
		'channel_decreasegain',
		'channel_frequency',
		'flash_lights',
		'flash_channel',
		'channel_rf_mute',
		'slot_rf_output',
		'slot_rf_power',
		'slot_offset',
		'slot_offset_inc',
		'slot_offset_dec',
		'slot_input_pad',
		'slot_polarity',
		'slot_tx_device_id',
		'slot_phantom_power',
		'slot_high_pass_filter',
	]) {
		assert.ok(ids.includes(id), `${id} is missing`)
	}
	assert.ok(!ids.includes('set_transmission_mode'))
	assert.ok(Object.keys(definitionsFor('anx4').actions).includes('set_antenna_configuration'))
})

test('AD actions go to the backend, not to a command-strings socket', async () => {
	const inst = definitionsFor('ad4q')
	const calls = []
	inst.isAxient = true
	inst.sendCommand = (cmd) => calls.push(['sendCommand', cmd])
	inst.backend = new Proxy(
		{},
		{
			get:
				(_, name) =>
				(...args) =>
					calls.push([name, ...args]),
		}
	)
	inst.parseActionOption = async (event, option) => String(event.options[option])
	const run = (id, options) => inst.actions[id].callback({ options, controlId: 'c', actionId: id }, {})
	await run('channel_setaudiogain', { channel: '2', gain: '50' })
	await run('channel_mute', { channel: '1', choice: 'TOGGLE' })
	await run('slot_rf_output', { slot: '1:3', onoff: 'RF_MUTE' })
	assert.deepEqual(calls, [
		['setGain', '2', 42],
		['setMute', '1', 'TOGGLE'],
		['command', '1', 'SLOT_RF_OUTPUT', ['3', 'RF_MUTE']],
	])
})
