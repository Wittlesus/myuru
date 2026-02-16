import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckpointData, CheckpointStore } from '../types/index.js';

/**
 * FileCheckpointStore — persists pipeline state to disk as JSON files.
 *
 * Enables checkpoint/resume for long-running pipelines. If a pipeline
 * crashes or is interrupted, it can resume from the last checkpoint.
 *
 * ```ts
 * const store = new FileCheckpointStore('.myuru/checkpoints');
 * const pipeline = new Pipeline({ ..., checkpointStore: store });
 * ```
 */
export class FileCheckpointStore implements CheckpointStore {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  async save(data: CheckpointData): Promise<void> {
    data.updatedAt = new Date().toISOString();
    const filePath = path.join(this.dir, `${data.id}.json`);
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  }

  async load(id: string): Promise<CheckpointData | null> {
    const filePath = path.join(this.dir, `${id}.json`);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as CheckpointData;
    } catch {
      return null;
    }
  }

  async list(): Promise<CheckpointData[]> {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
      return files.map(f => {
        const raw = fs.readFileSync(path.join(this.dir, f), 'utf-8');
        return JSON.parse(raw) as CheckpointData;
      });
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    const filePath = path.join(this.dir, `${id}.json`);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Already deleted
    }
  }
}

/**
 * InMemoryCheckpointStore — for testing and short-lived pipelines.
 */
export class InMemoryCheckpointStore implements CheckpointStore {
  private store = new Map<string, CheckpointData>();

  async save(data: CheckpointData): Promise<void> {
    data.updatedAt = new Date().toISOString();
    this.store.set(data.id, JSON.parse(JSON.stringify(data)) as CheckpointData);
  }

  async load(id: string): Promise<CheckpointData | null> {
    const data = this.store.get(id);
    return data ? JSON.parse(JSON.stringify(data)) as CheckpointData : null;
  }

  async list(): Promise<CheckpointData[]> {
    return [...this.store.values()].map(d => structuredClone(d));
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
