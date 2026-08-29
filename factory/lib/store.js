import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class JobStore {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.jobsDir = path.join(stateDir, 'jobs');
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

  async write(job) {
    job.updatedAt = new Date().toISOString();
    await fs.writeFile(this.jobFile(job.id), JSON.stringify(job, null, 2), 'utf8');
    return job;
  }

  async patch(id, patch) {
    const job = await this.get(id);
    if (!job) throw new Error(`Unknown job: ${id}`);
    Object.assign(job, patch);
    return this.write(job);
  }

  async appendLog(id, line) {
    const job = await this.get(id);
    if (!job) return;
    const stamp = new Date().toISOString().slice(11, 19);
    job.logs.push(`[${stamp}] ${line}`);
    if (job.logs.length > 240) job.logs = job.logs.slice(-240);
    await this.write(job);
  }

  async get(id) {
    try {
      return JSON.parse(await fs.readFile(this.jobFile(id), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
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
