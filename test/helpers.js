// A stand-in for the Companion instance: just what the state store and the backends call.

import WirelessApi from '../src/internalAPI.js'
import { FakeAd4q } from '../src/driver/fake/fake-ad4q.js'
import { AxientBackend } from '../src/backends/axient.js'
import { Models } from '../src/setup.js'

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll `fn` until it returns something truthy, or fail after `ms`. */
export async function until(fn, ms = 4000, what = 'condition') {
	const deadline = Date.now() + ms
	for (;;) {
		const v = fn()
		if (v) return v
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
		await delay(20)
	}
}

export function fakeInstance(modelId) {
	const instance = {
		model: { ...Models[modelId] },
		config: { variableFormat: 'units' },
		variables: {},
		feedbackChecks: [],
		statuses: [],
		logs: [],
		setVariableValues(values) {
			Object.assign(this.variables, values)
		},
		checkFeedbacks(...ids) {
			this.feedbackChecks.push(...ids)
		},
		refreshChoices() {},
	}
	instance.api = new WirelessApi(instance)
	return instance
}

/**
 * A simulated unit and an AxientBackend connected to it. `commandPort: false` points the
 * control port at nothing, as for a unit with command strings turned off.
 */
export async function axientOnFake(t, { model = 'AD4Q', modelId, channels, commandPort = true, metering = {} } = {}) {
	const fake = new FakeAd4q({ model, channels })
	await fake.listen()
	// what arrives at the control port, chunk by chunk: an unpaced client sends several frames per chunk
	const chunks = []
	fake.commands.server.on('connection', (socket) => socket.on('data', (d) => chunks.push(d.toString('latin1'))))
	const id = modelId ?? model.toLowerCase()
	const inst = fakeInstance(id)
	let savedCid
	let licensedChannels = null
	const backend = new AxientBackend({
		api: inst.api,
		model: inst.model,
		config: {
			host: '127.0.0.1',
			port: commandPort ? fake.commandPort : 1,
			meteringOn: true,
			meteringInterval: 100,
			...metering,
		},
		log: (level, message) => inst.logs.push(`[${level}] ${message}`),
		status: (status, message) => inst.statuses.push({ status, message }),
		checkFeedbacks: (...ids) => inst.checkFeedbacks(...ids),
		saveCid: (cid) => (savedCid = cid),
		channelCount: (n) => (licensedChannels = n),
		driver: {
			port: fake.controlPort,
			cid: fake.cid.toString('hex'),
			localIp: '127.0.0.1',
			advert: false,
			timings: { sendGapMs: 2, connectTimeoutMs: 4000 },
			requestTimeoutMs: 800,
		},
	})
	t.after(async () => {
		const t0 = Date.now()
		await backend.stop()
		const t1 = Date.now()
		await fake.stop()
		if (process.env.TEARDOWN_TIMING)
			console.error(`teardown ${model}: backend ${t1 - t0} ms, fake ${Date.now() - t1} ms`)
	})
	backend.start()
	return {
		fake,
		inst,
		backend,
		chunks,
		get savedCid() {
			return savedCid
		},
		get licensedChannels() {
			return licensedChannels
		},
	}
}

export const lastStatus = (inst) => inst.statuses.at(-1)?.status
