/**
 * The GitHub surfaces, all optional. Each call degrades gracefully: a missing
 * permission (403/404) becomes a note in the report and never changes the
 * decision, which was already computed and written to disk.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { COMMENT_MARKER } from '../../../verify-policy/src/index';

export interface GitHubContext {
  api_url: string;
  token: string | null;
  owner: string;
  repo: string;
  /** The commit the run checks: a pull request's head commit (check runs attach to it). */
  sha: string;
  ref: string;
  /**
   * The commit GitHub built for `ref` (GITHUB_SHA): on a pull request, the merge commit of
   * refs/pull/N/merge. Code scanning requires this pair; a head SHA with a merge ref is a 400.
   */
  ref_sha?: string | null;
  pull_number: number | null;
  /** The pull request's base commit, for reading a source as it was before the change. */
  base_sha?: string | null;
  event_name: string;
  actor: string | null;
  run_id: string | null;
}

export type Permission = 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none';

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class GitHub {
  constructor(
    private readonly ctx: GitHubContext,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get available(): boolean {
    return !!this.ctx.token;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.ctx.token) throw new GitHubError(401, 'no GitHub token');
    const res = await this.fetchImpl(`${this.ctx.api_url.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.ctx.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'xyntherium-verify-gate/0.1.0',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new GitHubError(res.status, `${method} ${path.split('?')[0]}: HTTP ${res.status}`);
    return (res.status === 204 ? null : await res.json()) as T;
  }

  private repoPath(p: string): string {
    return `/repos/${encodeURIComponent(this.ctx.owner)}/${encodeURIComponent(this.ctx.repo)}${p}`;
  }

  /** Files changed in the pull request, or null when they cannot be listed. */
  async changedFiles(): Promise<string[] | null> {
    if (!this.ctx.pull_number) return null;
    const out: string[] = [];
    for (let page = 1; page <= 30; page++) {
      const files = await this.call<{ filename: string; previous_filename?: string }[]>('GET', this.repoPath(`/pulls/${this.ctx.pull_number}/files?per_page=100&page=${page}`));
      for (const f of files) {
        out.push(f.filename);
        if (f.previous_filename) out.push(f.previous_filename);
      }
      if (files.length < 100) return out;
    }
    return null; // more than 3,000 files: treat as unknown and run
  }

  /** A repository file's text at `ref`, or null when it does not exist there. */
  async fileAt(path: string, ref: string): Promise<string | null> {
    if (!this.ctx.token) throw new GitHubError(401, 'no GitHub token');
    const enc = path.split('/').map(encodeURIComponent).join('/');
    const res = await this.fetchImpl(`${this.ctx.api_url.replace(/\/$/, '')}${this.repoPath(`/contents/${enc}?ref=${encodeURIComponent(ref)}`)}`, {
      headers: { authorization: `Bearer ${this.ctx.token}`, accept: 'application/vnd.github.raw+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'xyntherium-verify-gate/0.1.0' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new GitHubError(res.status, `GET /contents: HTTP ${res.status}`);
    return res.text();
  }

  /** Create or update the Gate's PR comment (found by its hidden marker). */
  async upsertComment(body: string): Promise<'created' | 'updated'> {
    const n = this.ctx.pull_number!;
    for (let page = 1; page <= 10; page++) {
      const comments = await this.call<{ id: number; body?: string; user?: { type?: string } }[]>('GET', this.repoPath(`/issues/${n}/comments?per_page=100&page=${page}`));
      const mine = comments.find((c) => c.body?.includes(COMMENT_MARKER));
      if (mine) {
        await this.call('PATCH', this.repoPath(`/issues/comments/${mine.id}`), { body });
        return 'updated';
      }
      if (comments.length < 100) break;
    }
    await this.call('POST', this.repoPath(`/issues/${n}/comments`), { body });
    return 'created';
  }

  async checkRun(o: { name: string; conclusion: 'success' | 'neutral' | 'failure'; title: string; summary: string }): Promise<void> {
    await this.call('POST', this.repoPath('/check-runs'), {
      name: o.name,
      head_sha: this.ctx.sha,
      status: 'completed',
      conclusion: o.conclusion,
      output: { title: o.title.slice(0, 255), summary: o.summary.slice(0, 65_000) },
    });
  }

  async uploadSarif(sarif: unknown): Promise<void> {
    const encoded = gzipSync(Buffer.from(JSON.stringify(sarif))).toString('base64');
    await this.call('POST', this.repoPath('/code-scanning/sarifs'), { commit_sha: this.ctx.ref_sha || this.ctx.sha, ref: this.ctx.ref, sarif: encoded, tool_name: 'Xyntherium Verify Gate' });
  }

  async permissionOf(user: string): Promise<Permission> {
    try {
      const r = await this.call<{ permission?: string; role_name?: string }>('GET', this.repoPath(`/collaborators/${encodeURIComponent(user)}/permission`));
      const p = (r.role_name ?? r.permission ?? 'none') as Permission;
      return ['admin', 'maintain', 'write', 'triage', 'read'].includes(p) ? p : 'none';
    } catch {
      return 'none';
    }
  }

  async inTeam(team: string, user: string): Promise<boolean> {
    const [org, slug] = team.split('/');
    try {
      const r = await this.call<{ state?: string }>('GET', `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(slug)}/memberships/${encodeURIComponent(user)}`);
      return r.state === 'active';
    } catch {
      return false;
    }
  }

  /** Who last applied `label` to the PR, if it is still applied. */
  async labelApplier(label: string): Promise<string | null> {
    const n = this.ctx.pull_number!;
    const issue = await this.call<{ labels?: { name: string }[] }>('GET', this.repoPath(`/issues/${n}`));
    if (!issue.labels?.some((l) => l.name === label)) return null;
    let applier: string | null = null;
    for (let page = 1; page <= 10; page++) {
      const events = await this.call<{ event: string; label?: { name: string }; actor?: { login: string } }[]>('GET', this.repoPath(`/issues/${n}/events?per_page=100&page=${page}`));
      for (const e of events) if (e.event === 'labeled' && e.label?.name === label && e.actor?.login) applier = e.actor.login;
      if (events.length < 100) break;
    }
    return applier;
  }

  /** The most recent comments on the PR, oldest first (for /verify-override). */
  async recentComments(): Promise<{ author: string; body: string; created_at: string }[]> {
    const n = this.ctx.pull_number!;
    const out: { author: string; body: string; created_at: string }[] = [];
    for (let page = 1; page <= 10; page++) {
      const cs = await this.call<{ user?: { login: string }; body?: string; created_at: string }[]>('GET', this.repoPath(`/issues/${n}/comments?per_page=100&page=${page}`));
      for (const c of cs) if (c.user?.login && c.body) out.push({ author: c.user.login, body: c.body, created_at: c.created_at });
      if (cs.length < 100) break;
    }
    return out;
  }
}

export function contextFromEnv(env: Record<string, string | undefined>, token: string | null): GitHubContext | null {
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? '').split('/');
  if (!owner || !repo) return null;
  let pull: number | null = null;
  try {
    if (env.GITHUB_EVENT_PATH) {
      const ev = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) as { pull_request?: { number?: number; head?: { sha?: string }; base?: { sha?: string } }; issue?: { number?: number; pull_request?: unknown } };
      pull = ev.pull_request?.number ?? (ev.issue?.pull_request ? ev.issue.number ?? null : null);
      if (ev.pull_request?.head?.sha) env = { ...env, XYN_HEAD_SHA: ev.pull_request.head.sha };
      if (ev.pull_request?.base?.sha) env = { ...env, XYN_BASE_SHA: ev.pull_request.base.sha };
    }
  } catch {
    pull = null;
  }
  const m = /^refs\/pull\/(\d+)\//.exec(env.GITHUB_REF ?? '');
  if (!pull && m) pull = Number(m[1]);
  return {
    api_url: env.GITHUB_API_URL ?? 'https://api.github.com',
    token,
    owner,
    repo,
    sha: env.XYN_HEAD_SHA ?? env.GITHUB_SHA ?? '',
    ref: env.GITHUB_REF ?? '',
    ref_sha: env.GITHUB_SHA ?? null,
    pull_number: pull,
    base_sha: env.XYN_BASE_SHA ?? null,
    event_name: env.GITHUB_EVENT_NAME ?? '',
    actor: env.GITHUB_ACTOR ?? null,
    run_id: env.GITHUB_RUN_ID ?? null,
  };
}
