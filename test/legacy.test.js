// The command-strings backend (ULX-D, QLX-D, SLX-D, SLX-D+, PSM1000) against a small TCP 2202
// stand-in that records what arrives and how it is chunked.

import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { LegacyBackend } from '../src/backends/legacy.js'
import { fakeInstance, until, delay } from './helpers.js'

/** A unit that answers a few GETs, and remembers every frame and every TCP chunk it received. */
async function fakeUnit(t, { reply = {} } = {}) {
	const unit = { frames: [], chunks: [], sockets: new Set(), connections: 0 }
	const server = net.createServer((socket) => {
		unit.connections += 1
		unit.sockets.add(socket)
		socket.on('close', () => unit.sockets.delete(socket))
		socket.on('error', () => {})
		let buf = ''
		socket.on('data', (d) => {
			const text = d.toString('latin1')
			unit.chunks.push(text)
			buf += text
			let i
			while ((i = buf.indexOf('>')) >= 0) {
				const frame = buf.slice(buf.indexOf('<') + 1, i).trim()
				buf = buf.slice(i + 1)
				unit.frames.push(frame)
				const m = /^GET (\d+) (\w+)$/.exec(frame)
				if (m && reply[m[2]]) socket.write(`< REP ${m[1]} ${m[2]} ${reply[m[2]]} >`)
			}
		})
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	unit.port = server.address().port
	unit.dropAll = () => {
		for (const s of unit.sockets) s.destroy()
	}
	t.after(async () => {
		unit.dropAll()
		await new Promise((resolve) => server.close(resolve))
	})
	return unit
}

function legacyOn(t, unit, modelId, { metering = {}, timings = {} } = {}) {
	const inst = fakeInstance(modelId)
	const backend = new LegacyBackend({
		api: inst.api,
		model: inst.model,
		config: { host: '127.0.0.1', port: unit.port, meteringOn: true, meteringInterval: 1000, ...metering },
		log: (level, message) => inst.logs.push(`[${level}] ${message}`),
		status: (status, message) => inst.statuses.push({ status, message }),
		checkFeedbacks: (...ids) => inst.checkFeedbacks(...ids),
		timings: { sendGapMs: 5, ...timings },
	})
	t.after(() => backend.stop())
	backend.start()
	return { inst, backend }
}

test('ULX-D: connect queries go out one per chunk, paced, and reports reach the variables', async (t) => {
	const unit = await fakeUnit(t, { reply: { NA_CHAN_NAME: '{Dante1}' } })
	const { inst } = legacyOn(t, unit, 'ulxd4q')
	await until(() => unit.frames.includes('SET 0 METER_RATE 1000'), 3000, 'metering set')
	assert.equal(unit.frames[0], 'GET 0 ALL')
	assert.ok(unit.frames.includes('GET 4 TX_FW_VER'))
	assert.equal(Math.max(...unit.chunks.map((c) => (c.match(/</g) ?? []).length)), 1, 'commands were sent in a burst')
	await until(() => inst.variables.ch_1_na_chan_name === 'Dante1', 2000, 'report applied')
})

test('ULX-D: a metering interval below 100 ms is raised to the documented minimum', async (t) => {
	const unit = await fakeUnit(t)
	legacyOn(t, unit, 'ulxd4', { metering: { meteringInterval: 50 } })
	await until(() => unit.frames.some((f) => f.startsWith('SET 0 METER_RATE')), 3000, 'metering set')
	assert.ok(unit.frames.includes('SET 0 METER_RATE 100'))
})

test('PSM1000: metering is set per channel, and turned off per channel when the connection closes', async (t) => {
	const unit = await fakeUnit(t)
	const { backend } = legacyOn(t, unit, 'psm1000')
	await until(() => unit.frames.includes('SET 2 METER_RATE 1000'), 3000, 'metering set')
	assert.ok(unit.frames.includes('SET 1 METER_RATE 1000'))
	await backend.stop()
	assert.ok(unit.frames.includes('SET 1 METER_RATE 0'), 'channel 1 metering left on')
	assert.ok(unit.frames.includes('SET 2 METER_RATE 0'), 'channel 2 metering left on')
})

test('the heartbeat stays a single timer however many times the connection drops', async (t) => {
	const unit = await fakeUnit(t)
	legacyOn(t, unit, 'slxd4', { timings: { heartbeatMs: 100 } })
	await until(() => unit.connections === 1, 3000, 'first connect')
	// TCPHelper reconnects two seconds after a drop
	for (let n = 2; n <= 3; n += 1) {
		await delay(300)
		unit.dropAll()
		await until(() => unit.connections === n, 5000, `reconnect ${n}`)
	}
	const before = unit.frames.filter((f) => f === 'GET 1 METER_RATE').length
	await delay(1000)
	const beats = unit.frames.filter((f) => f === 'GET 1 METER_RATE').length - before
	// one timer at 100 ms gives about ten a second; the old code added one timer per reconnect
	assert.ok(beats >= 6 && beats <= 13, `expected about 10 heartbeats in a second, got ${beats}`)
})

test('a silent link is dropped and reopened by the watchdog', async (t) => {
	const unit = await fakeUnit(t)
	const { inst } = legacyOn(t, unit, 'qlxd4', { timings: { heartbeatMs: 100, silenceMs: 400 } })
	await until(() => unit.connections === 1, 3000, 'first connect')
	// the stand-in never answers, so after 400 ms of silence the backend reconnects on its own
	await until(() => unit.connections >= 2, 3000, 'watchdog reconnect')
	assert.ok(inst.logs.some((l) => /No data from the unit/.test(l)))
})

test('an unparseable frame or a REP ERR does not take the connection down', async (t) => {
	const unit = await fakeUnit(t)
	const { inst, backend } = legacyOn(t, unit, 'ulxd4')
	await until(() => unit.connections === 1 && unit.sockets.size === 1, 3000, 'connect')
	const [socket] = unit.sockets
	socket.write('< REP >< SAMPLE x >< REP ERR >< garbage >< REP 1 CHAN_NAME {Vox} >')
	await until(() => inst.variables.ch_1_name === 'Vox', 2000, 'frame after the bad ones')
	assert.equal(unit.connections, 1)
	assert.ok(backend.socket?.isConnected)
})
