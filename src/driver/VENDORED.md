# Vendored driver

Everything under `src/driver/` is copied from
[mbsound/soundbase-plugin-shure-axient-digital](https://github.com/mbsound/soundbase-plugin-shure-axient-digital)
(formerly `soundbase-plugin-shure-ad4q`) at commit `0ec16bf895fe59677f9bde97acda34fcb3d4cfdb`
(v0.2.4: multicast discovery and session on a chosen network adapter, reconnect
and loss fixes from a deep review). That repository's driver has been run against real AD4Q, AD4D and
ANX4 units; this module uses it unchanged for those receivers so it inherits that testing.

| Path | What it is |
| --- | --- |
| `acn/pdu.js` | ACN root/SDT/DMP codec |
| `acn/slp.js` | SLP discovery (UDP 8427) and this controller's advert |
| `acn/session.js` | One ACN session: join, acks, NAK retransmit, paced and windowed sends |
| `ad4q/properties.js` | Address map and value codecs |
| `ad4q/device.js` | `Ad4qDevice`: typed reads, committed writes with read-back, subscriptions |
| `ad4q/scan.js` | RF scan support (imported by `properties.js`/`device.js`; not exposed in Companion) |
| `cmdstrings/client.js` | Shure's documented TCP 2202 command strings |
| `netutil.js` | Interface selection and address helpers |
| `fake/*` | The reference's simulators; used only by `test/` |

## Local changes

Keep this list current. Every change is marked `[companion]` in the source. To re-sync, copy the
files from upstream again and re-apply these. All other files are byte-identical to upstream.

`cmdstrings/client.js`:

1. **`parseSample` also returns `line`**, the frame without brackets, so the module can decode the
   audio/RF LED bitmaps its button icons draw.
2. **`set(channel, prop, args)`**: a public, documented `SET` that resolves on the unit's report
   and rejects on `< REP ERR >`. Used for ShowLink slot controls and group/channel, which the ACN
   driver does not cover.
3. **`query(channel, prop, slot)`**: a `GET` that resolves `null` on `< REP ERR >` instead of waiting
   out the 3 s timeout, for properties a model or firmware may not have.

The two-digit `SAMPLE` channel fix this module first carried locally is upstream as of `5cca260`.

The plugin's adapter is not vendored; `src/backends/axient.js` follows it, including v0.2.3's
restart-loop breaker, the once-a-minute ANX4 refresh and the command-port retry backoff, and from
v0.2.4: the 5 s loss debounce, names reduced to ASCII rather than refused, the remembered component
id falling back to the unit advertising at the address, a stale read round ignored after a reconnect,
and the "Network adapter" setting for the session (the shared SLP browse still uses every adapter,
since several connections share it). The meter rates are still reset one at a time on close, as
every exchange on the control port is, rather than in v0.2.4's parallel burst.
