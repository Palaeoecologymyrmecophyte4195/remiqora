'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const manifest = require('../manifest.json');
const { evaluateGpu, freeBytes, runChecks } = require('../src/bootstrap/checks');
const { runSetup, isSetupComplete, describePlan } = require('../src/bootstrap/run');
const { buildComponents, demucsProject } = require('../src/bootstrap/components');
const { extract, tarBinary } = require('../src/bootstrap/extract');
const { layout, PLATFORM } = require('../src/paths');
const { backendEnv } = require('../src/server');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'remiqora-setup-'));
const req = manifest.requirements;

test('GPU verdicts', () => {
  assert.deepEqual(evaluateGpu({ name: 'RTX 4080', driver: '610.47', vramMiB: 16376, computeCap: 8.9 }, req), { ok: true });
  assert.equal(evaluateGpu(null, req).code, 'no-gpu');
  assert.equal(evaluateGpu({ name: 'RTX 4080', driver: '552.44', vramMiB: 16376, computeCap: 8.9 }, req).code, 'old-driver');
  assert.equal(evaluateGpu({ name: 'GTX 1080', driver: '610.47', vramMiB: 8192, computeCap: 6.1 }, req).code, 'old-gpu');
  assert.equal(evaluateGpu({ name: 'RTX 4080', driver: '610.47', vramMiB: 16376, computeCap: null }, req).ok, true);
});

test('checks refuse unsupported platforms and report free space', async () => {
  const dir = tmp();
  assert.ok((await freeBytes(path.join(dir, 'not', 'created', 'yet'))) > 0);
  const linux = await runChecks({ platform: 'linux-x64', dataRoot: dir, manifest, fetchImpl: async () => ({}) });
  assert.equal(linux.blocking.code, 'unsupported-platform');
  const offline = await runChecks({ platform: 'darwin-arm64', dataRoot: dir, manifest, fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(offline.blocking.code, 'offline');
  const online = await runChecks({ platform: 'darwin-arm64', dataRoot: dir, manifest, fetchImpl: async () => ({ status: 200 }) });
  assert.equal(online.blocking, null);
});

/** Fake components: the runner does not care what a component installs. */
function fakeComponents(log, { failOn } = {}) {
  return ['a', 'b', 'c'].map((id) => ({
    id, weight: 10, version: '1',
    verify: async () => true,
    async install(_ctx, report) {
      log.push(id);
      report({ done: 5, total: 10 });
      if (id === failOn) throw new Error(`boom in ${id}`);
    },
  }));
}

test('runs components in order, persists state and skips finished ones on the next run', async () => {
  const L = layout(tmp(), PLATFORM, manifest);
  const log = [];
  const events = [];
  const ctx = { L, manifest, platform: PLATFORM, resources: {}, components: fakeComponents(log, { failOn: 'b' }) };
  await assert.rejects(runSetup(ctx, (e) => events.push(e)), (err) => err.componentId === 'b');
  assert.deepEqual(log, ['a', 'b']);
  assert.equal(await isSetupComplete(ctx), false);

  log.length = 0;
  ctx.components = fakeComponents(log);
  await runSetup(ctx, () => {});
  assert.deepEqual(log, ['b', 'c'], 'a is already installed and must not run again');
  assert.equal(await isSetupComplete(ctx), true);
  assert.deepEqual((await describePlan(ctx)).map((p) => p.done), [true, true, true]);
});

test('a new component version is installed again', async () => {
  const L = layout(tmp(), PLATFORM, manifest);
  const log = [];
  const ctx = { L, manifest, platform: PLATFORM, resources: {}, components: fakeComponents(log) };
  await runSetup(ctx, () => {});
  ctx.components = fakeComponents(log).map((c) => (c.id === 'c' ? { ...c, version: '2' } : c));
  log.length = 0;
  await runSetup(ctx, () => {});
  assert.deepEqual(log, ['c']);
});

test('skipped components are reported and do not count as installed', async () => {
  const L = layout(tmp(), PLATFORM, manifest);
  const log = [];
  const events = [];
  const ctx = { L, manifest, platform: PLATFORM, resources: {}, skip: ['b'], components: fakeComponents(log).map((c) => ({ ...c, verify: async () => false })) };
  await runSetup(ctx, (e) => events.push(e));
  assert.deepEqual(log, ['a', 'c']);
  assert.ok(events.some((e) => e.id === 'b' && e.status === 'skipped'));
});

test('the real plan has every component, in dependency order', () => {
  const L = layout(tmp(), 'win32-x64', manifest);
  const resources = { backend: path.join(__dirname, '..', '..', 'backend'), acePatch: path.join(__dirname, '..', '..', 'external', 'patches', 'ace-step.patch') };
  const ids = buildComponents({ L, manifest, platform: 'win32-x64', resources }).map((c) => c.id);
  assert.deepEqual(ids, ['uv', 'ffmpeg', 'engine', 'backend-env', 'ace-step', 'demucs', 'weights']);
});

test('Demucs gets the CUDA torch index off macOS only', () => {
  assert.match(demucsProject('win32-x64'), /pytorch-cu128/);
  assert.doesNotMatch(demucsProject('darwin-arm64'), /pytorch-cu128/);
});

test('the backend environment points every path at the data root', () => {
  const L = layout(tmp(), 'win32-x64', manifest);
  const env = backendEnv({ L, manifest, platform: 'win32-x64' });
  assert.equal(env.REMIQORA_DATA_DIR, L.data);
  assert.equal(env.REMIQORA_LOG_DIR, L.logs);
  assert.equal(env.YUE2_DIR, L.yue2);
  assert.equal(env.CUDA_BIN_DIR, L.yue2Bin);
  assert.ok(env.PATH.split(path.delimiter).includes(L.uvDir));
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
});

test('extracts a tar.gz archive', async () => {
  const src = tmp();
  fs.mkdirSync(path.join(src, 'top', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(src, 'top', 'sub', 'f.txt'), 'hello');
  const archive = path.join(tmp(), 'a.tar.gz');
  execFileSync(tarBinary(), ['-czf', archive, '-C', src, 'top']); // the same bsdtar the app uses; GNU tar reads "E:\..." as a remote host
  const out = tmp();
  await extract(archive, out, { stripComponents: 1 });
  assert.equal(fs.readFileSync(path.join(out, 'sub', 'f.txt'), 'utf8'), 'hello');
});
