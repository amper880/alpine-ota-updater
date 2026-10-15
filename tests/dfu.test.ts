import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DfuError, runLegacyDfu, type DfuTransport } from '../src/lib/dfu/legacy-dfu.ts';

interface SimOptions {
  validateStatus?: number;
  silentAfterStart?: boolean;
  /** Corrupt the byte count reported in receipts. */
  badReceipt?: boolean;
  /** Largest packet accepted (MTU - 3). */
  maxPacket?: number;
}

/** Simulated Adafruit legacy DFU bootloader. */
class SimBootloader implements DfuTransport {
  notify?: (d: DataView) => void;
  state: 'idle' | 'sizes' | 'init' | 'image' | 'done' = 'idle';
  appSize = 0;
  init: number[] = [];
  image: number[] = [];
  prn = 0;
  packetsSinceReceipt = 0;
  activated = false;
  log: string[] = [];
  opts: SimOptions;
  constructor(opts: SimOptions = {}) {
    this.opts = opts;
  }

  private send(bytes: number[]) {
    const n = this.notify;
    setTimeout(() => n?.(new DataView(new Uint8Array(bytes).buffer)), 1);
  }

  async startNotifications(cb: (d: DataView) => void) {
    this.notify = cb;
  }

  async writeControl(d: Uint8Array) {
    this.log.push(`cp ${[...d].join(',')}`);
    switch (d[0]) {
      case 0x01:
        assert.equal(d[1], 0x04, 'image type must be application');
        this.state = 'sizes';
        break;
      case 0x02:
        if (d[1] === 0x00) this.state = 'init';
        else {
          assert.equal(this.state, 'init');
          this.send([0x10, 0x02, 0x01]);
        }
        break;
      case 0x08:
        this.prn = d[1] | (d[2] << 8);
        break;
      case 0x03:
        this.state = 'image';
        break;
      case 0x04:
        assert.equal(this.image.length, this.appSize, 'image must be complete before validation');
        this.send([0x10, 0x04, this.opts.validateStatus ?? 0x01]);
        break;
      case 0x05:
        this.activated = true;
        break;
      default:
        throw new Error(`unexpected op ${d[0]}`);
    }
  }

  async writePacket(d: Uint8Array) {
    assert.ok(d.length <= (this.opts.maxPacket ?? 20), 'packets must fit the MTU');
    if (this.state === 'sizes') {
      const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
      assert.equal(d.length, 12);
      assert.equal(v.getUint32(0, true), 0);
      assert.equal(v.getUint32(4, true), 0);
      this.appSize = v.getUint32(8, true);
      if (!this.opts.silentAfterStart) this.send([0x10, 0x01, 0x01]);
    } else if (this.state === 'init') {
      this.init.push(...d);
    } else if (this.state === 'image') {
      this.image.push(...d);
      this.packetsSinceReceipt++;
      if (this.prn && this.packetsSinceReceipt === this.prn) {
        this.packetsSinceReceipt = 0;
        const n = this.image.length + (this.opts.badReceipt ? 1 : 0);
        this.send([0x11, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
      }
      if (this.image.length === this.appSize) {
        this.state = 'done';
        this.send([0x10, 0x03, 0x01]);
      }
    } else {
      throw new Error(`packet in state ${this.state}`);
    }
  }
}

const firmware = new Uint8Array(12345).map((_, i) => (i * 7) % 256);
const init = new Uint8Array([0x52, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00, 0xfe, 0xff, 0xab, 0xcd]);

test('transfers a firmware image with packet receipt notifications', async () => {
  const sim = new SimBootloader();
  const progress: number[] = [];
  await runLegacyDfu(sim, firmware, init, { prn: 8, onProgress: (s) => progress.push(s) });
  assert.deepEqual(new Uint8Array(sim.image), firmware);
  assert.deepEqual(new Uint8Array(sim.init), init);
  assert.equal(sim.prn, 8);
  assert.ok(sim.activated);
  assert.equal(progress.at(-1), firmware.length);
});

test('works without flow control (PRN 0)', async () => {
  const sim = new SimBootloader();
  await runLegacyDfu(sim, firmware, init, { prn: 0 });
  assert.deepEqual(new Uint8Array(sim.image), firmware);
  assert.ok(!sim.log.some((l) => l.startsWith('cp 8,')));
});

test('handles an image that is an exact multiple of PRN × packet size', async () => {
  const fw = new Uint8Array(20 * 8 * 10).fill(3);
  const sim = new SimBootloader();
  await runLegacyDfu(sim, fw, init, { prn: 8 });
  assert.equal(sim.image.length, fw.length);
});

test('reports a validation failure', async () => {
  const sim = new SimBootloader({ validateStatus: 0x05 });
  await assert.rejects(runLegacyDfu(sim, firmware, init), (e: unknown) => e instanceof DfuError && e.code === 'status' && /CRC/.test(e.message));
  assert.ok(!sim.activated);
});

test('times out when the bootloader does not answer', async () => {
  const sim = new SimBootloader({ silentAfterStart: true });
  await assert.rejects(runLegacyDfu(sim, firmware, init, { timeoutMs: 50 }), (e: unknown) => e instanceof DfuError && e.code === 'timeout');
});

test('detects a wrong receipt byte count', async () => {
  const sim = new SimBootloader({ badReceipt: true });
  await assert.rejects(runLegacyDfu(sim, firmware, init, { prn: 4 }), (e: unknown) => e instanceof DfuError && e.code === 'status');
});

test('can be cancelled during the transfer', async () => {
  const sim = new SimBootloader();
  const ctrl = new AbortController();
  const run = runLegacyDfu(sim, firmware, init, {
    prn: 8,
    signal: ctrl.signal,
    onProgress: (s) => {
      if (s > 2000) ctrl.abort();
    },
  });
  await assert.rejects(run, (e: unknown) => e instanceof DfuError && e.code === 'aborted');
  assert.ok(sim.image.length < firmware.length);
  assert.ok(!sim.activated);
});

test('uses large packets when the MTU allows', async () => {
  const sim = new SimBootloader({ maxPacket: 244 });
  let writes = 0;
  const counting: DfuTransport = {
    startNotifications: (cb) => sim.startNotifications(cb),
    writeControl: (d) => sim.writeControl(d),
    writePacket: (d) => {
      writes++;
      return sim.writePacket(d);
    },
  };
  await runLegacyDfu(counting, firmware, init, { prn: 8, packetSize: 244 });
  assert.deepEqual(new Uint8Array(sim.image), firmware);
  assert.ok(writes < firmware.length / 200, `expected few large writes, got ${writes}`);
});
