import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileCheckpointStore, InMemoryCheckpointStore } from './checkpoint.js';
import type { CheckpointData } from '../types/index.js';

function makeCheckpoint(id: string): CheckpointData {
  return {
    id,
    pipelineName: 'test-pipeline',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    context: { task: 'test', results: {}, totalUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, stepCount: 0 } },
    completedSteps: ['step-1'],
    status: 'running',
  };
}

describe('InMemoryCheckpointStore', () => {
  it('should save and load checkpoint', async () => {
    const store = new InMemoryCheckpointStore();
    const cp = makeCheckpoint('cp-1');

    await store.save(cp);
    const loaded = await store.load('cp-1');

    assert.ok(loaded);
    assert.equal(loaded.id, 'cp-1');
    assert.equal(loaded.pipelineName, 'test-pipeline');
  });

  it('should return null for missing checkpoint', async () => {
    const store = new InMemoryCheckpointStore();
    const result = await store.load('nonexistent');
    assert.equal(result, null);
  });

  it('should list checkpoints', async () => {
    const store = new InMemoryCheckpointStore();
    await store.save(makeCheckpoint('a'));
    await store.save(makeCheckpoint('b'));

    const list = await store.list();
    assert.equal(list.length, 2);
  });

  it('should delete checkpoint', async () => {
    const store = new InMemoryCheckpointStore();
    await store.save(makeCheckpoint('del'));
    await store.delete('del');

    const loaded = await store.load('del');
    assert.equal(loaded, null);
  });

  it('should return deep copies (not references)', async () => {
    const store = new InMemoryCheckpointStore();
    const cp = makeCheckpoint('ref-test');
    await store.save(cp);

    const loaded = await store.load('ref-test');
    assert.ok(loaded);
    loaded.status = 'completed';

    const reloaded = await store.load('ref-test');
    assert.ok(reloaded);
    assert.equal(reloaded.status, 'running');
  });
});

describe('FileCheckpointStore', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('should save and load checkpoint', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myuru-test-'));
    const store = new FileCheckpointStore(tmpDir);
    const cp = makeCheckpoint('file-1');

    await store.save(cp);
    const loaded = await store.load('file-1');

    assert.ok(loaded);
    assert.equal(loaded.id, 'file-1');
  });

  it('should return null for missing file', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myuru-test-'));
    const store = new FileCheckpointStore(tmpDir);
    const result = await store.load('missing');
    assert.equal(result, null);
  });

  it('should list checkpoints from disk', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myuru-test-'));
    const store = new FileCheckpointStore(tmpDir);
    await store.save(makeCheckpoint('f-a'));
    await store.save(makeCheckpoint('f-b'));

    const list = await store.list();
    assert.equal(list.length, 2);
  });

  it('should delete checkpoint file', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myuru-test-'));
    const store = new FileCheckpointStore(tmpDir);
    await store.save(makeCheckpoint('f-del'));
    await store.delete('f-del');

    const loaded = await store.load('f-del');
    assert.equal(loaded, null);
  });
});
