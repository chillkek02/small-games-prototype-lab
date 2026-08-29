import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class JobStore {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.jobsDir = path.join(stateDir, 'jobs');
    this.chains = new Map();
  }

  async init() {
    await fs.mkdir(this.jobsDir, { recursive: true });
  }

  jobDir(id) {
    return path.join(this.jobsDir, id);
  }

  jobFile(id) {
    return path.join(this.jobDir(id), 'job.json');
  }

  enqueue(id, operation) {
    const previous = this.chains.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.chains.set(id, next);
    next.finally(() => {
      if (this.chains.get(id) === next) this.chains.delete(id);
    }).catch(() => {});
    return next;
  }

  async create({ game, instruction }) {
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const job = {
      id,
      game,
      instruction,
      status: 'queued',
      stage: 'Queued',
      attempt: 0,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      logs: [],
      qa: null,
      diffStat: '',
      error: null
    };

    await fs.mkdir(this.jobDir(id), { recursive: true });
    await this.write(job);
    return job;
  }

  async writeAtomic(job) {
    job.updatedAt = new Date().toISOString();
    const finalPath = this.jobFile(job.id);
    const tempPath = path.join(this.jobDir(job.id), `job.${process.pid}.${randomUUID()}.tmp`);
    const text = JSON.stringify(job, null, 2);
    await fs.writeFile(tempPath, text, 'utf8');
    await fs.rename(tempPath, finalPath);
    return job;
  }

  async write(job) {
    return this.enqueue(job.id, () => this.writeAtomic(job));
  }

  async readRaw(id) {
    try {
      return await fs.readFile(this.jobFile(id), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async quarantineCorruptJob(id, raw, error) {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const corruptPath = path.join(this.jobDir(id), `job.corrupt-${stamp}.json`);
      await fs.writeFile(corruptPath, raw, 'utf8');
      await fs.rm(this.jobFile(id), { force: true });
      console.warn(`Quarantined corrupt Game Factory job ${id}: ${error.message}`);
    } catch (quarantineError) {
      console.error(`Failed to quarantine corrupt job ${id}`, quarantineError);
    }
  }

  async get(id) {
    const raw = await this.readRaw(id);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      if (error instanceof SyntaxError) {
        await this.quarantineCorruptJob(id, raw, error);
        return null;
      }
      throw error;
    }
  }

  async patch(id, patch) {
    return this.enqueue(id, async () => {
      const job = await this.get(id);
      if (!job) throw new Error(`Unknown or corrupt job: ${id}`);
      Object.assign(job, patch);
      return this.writeAtomic(job);
    });
  }

  async appendLog(id, line) {
    return this.enqueue(id, async () => {
      const job = await this.get(id);
      if (!job) return null;
      const stamp = new Date().toISOString().slice(11, 19);
      job.logs.push(`[${stamp}] ${line}`);
      if (job.logs.length > 240) job.logs = job.logs.slice(-240);
      return this.writeAtomic(job);
    });
  }

  async list(limit = 30) {
    let entries = [];
    try {
      entries = await fs.readdir(this.jobsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const jobs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const job = await this.get(entry.name);
      if (job) jobs.push(job);
    }

    return jobs
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  }
}
