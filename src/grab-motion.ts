// Motion in Grab (spec v0.3): the bridge's motion jobs. Grab's Motion tab asks the bridge to run
// suggest_motion on the page the designer is looking at, in this process, with no agent round-trip.
//
// Trust: the routes are served only when the session proxies the designer's own loopback dev
// server (grab-bridge.ts decides that, with the other authoring routes). Everything in a request
// is untrusted: the path is joined to the session's proxy origin and must keep it; the selector
// is only ever handed to querySelector in the headless page. The taste binding comes from the
// session, never the request. A job response carries no fragment, timeline or local path.
//
// Limits per session: one job at a time, 10 starts per 10 minutes, a 60 s deadline that aborts
// the work, results kept 10 minutes, and at most 40 playgrounds registered (oldest unregistered).

import { randomBytes } from "node:crypto";

import { unregisterPlayground } from "./motion-session.js";
import type { SuggestMotionInput, SuggestMotionResult } from "./motion-suggest/index.js";
import type { TasteStore } from "./taste-store.js";

export const MOTION_JOB_DEADLINE_MS = 60_000;
export const MOTION_RATE_WINDOW_MS = 10 * 60_000;
export const MOTION_RATE_MAX = 10;
export const MOTION_RESULT_TTL_MS = 10 * 60_000;
export const MOTION_MAX_PLAYGROUNDS = 40;
const MAX_PATH_LENGTH = 2048;
const MAX_SELECTOR_LENGTH = 512;

export type MotionSuggestFn = (input: SuggestMotionInput) => Promise<SuggestMotionResult>;

export type GrabMotionOptions = {
  store: TasteStore;
  profile?: string;
  project?: string;
  /** Tests only: replaces suggestMotion. */
  suggest?: MotionSuggestFn;
  /** Tests only: a shorter deadline. */
  deadlineMs?: number;
};

type JobState = "running" | "done" | "failed" | "cancelled";

type MotionJob = {
  id: string;
  state: JobState;
  step: "copying" | "building";
  startedAt: number;
  finishedAt?: number;
  inputs: { path: string; selector?: string; trigger?: string };
  controller: AbortController;
  result?: SuggestMotionResult;
  message?: string;
};

export type GrabMotionState = {
  sessionId: string;
  options: GrabMotionOptions;
  proxyTarget: string;
  running: MotionJob | null;
  /** The work behind the running job; the slot stays taken until it settles. */
  work: Promise<void> | null;
  jobs: Map<string, MotionJob>;
  starts: number[];
  owned: string[];
};

export function newGrabMotionState(options: GrabMotionOptions, proxyTarget: string): GrabMotionState {
  return { sessionId: randomBytes(8).toString("hex"), options, proxyTarget, running: null, work: null, jobs: new Map(), starts: [], owned: [] };
}

/** Stops the session's job: aborts its work. Called when the Grab session stops. */
export function stopGrabMotion(state: GrabMotionState | undefined): void {
  if (!state) return;
  const job = state.running;
  if (job && job.state === "running") {
    job.state = "cancelled";
    job.message = "The Grab session stopped.";
    job.finishedAt = Date.now();
  }
  if (job) job.controller.abort();
}

function prune(state: GrabMotionState, now: number): void {
  for (const [id, job] of state.jobs) {
    if (job.finishedAt !== undefined && now - job.finishedAt > MOTION_RESULT_TTL_MS) state.jobs.delete(id);
  }
  state.starts = state.starts.filter((t) => now - t < MOTION_RATE_WINDOW_MS);
}

export type MotionReply = { status: number; body: Record<string, unknown> };

const bad = (error: string): MotionReply => ({ status: 400, body: { error } });

/** Validates the request; returns the URL to capture, or a 400. */
function readRequest(state: GrabMotionState, body: unknown): { url: string; inputs: MotionJob["inputs"] } | MotionReply {
  if (!body || typeof body !== "object") return bad("Send a JSON object.");
  const b = body as Record<string, unknown>;
  const path = b.path;
  if (typeof path !== "string" || !path) return bad("path is required.");
  if (path.length > MAX_PATH_LENGTH) return bad("path is too long.");
  // A path on the proxied origin: one leading slash, no scheme, no host, no backslash.
  if (path[0] !== "/" || path.startsWith("//") || /\\/.test(path) || /^[a-z][a-z0-9+.-]*:/i.test(path) || /[\u0000-\u001f]/.test(path)) {
    return bad("path must be a path on this site, such as /pricing.");
  }
  let url: URL;
  try {
    url = new URL(path, state.proxyTarget);
  } catch {
    return bad("path must be a path on this site, such as /pricing.");
  }
  if (url.origin !== new URL(state.proxyTarget).origin) return bad("path must stay on this site.");
  const inputs: MotionJob["inputs"] = { path };
  if (b.selector !== undefined) {
    if (typeof b.selector !== "string" || !b.selector.trim()) return bad("selector must be a non-empty string.");
    if (b.selector.length > MAX_SELECTOR_LENGTH) return bad("selector must be at most " + MAX_SELECTOR_LENGTH + " characters.");
    inputs.selector = b.selector;
  }
  if (b.trigger !== undefined) {
    if (inputs.selector === undefined) return bad("trigger goes with selector.");
    if (b.trigger !== "entrance" && b.trigger !== "hover" && b.trigger !== "scroll") return bad("trigger must be entrance, hover or scroll.");
    inputs.trigger = b.trigger;
  }
  return { url: url.href, inputs };
}

function plainFailure(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : String(e);
  if (name === "CaptureTimeoutError" || /timed? ?out|deadline/i.test(msg)) return "It took too long.";
  if (name === "CaptureUnavailableError") return "The browser Raven uses to copy pages isn't available.";
  if (/ERR_CONNECTION|ECONNREFUSED|net::|could not be read|navigation/i.test(msg)) return "The page didn't load.";
  return "Something went wrong while copying it.";
}

export async function startMotionJob(state: GrabMotionState, body: unknown, suggestMotion: MotionSuggestFn): Promise<MotionReply> {
  const now = Date.now();
  prune(state, now);
  const req = readRequest(state, body);
  if ("status" in req) return req;
  if (state.running) return { status: 409, body: { error: "A motion job is already running.", job: state.running.id } };
  if (state.starts.length >= MOTION_RATE_MAX) return { status: 429, body: { error: "Wait a few minutes." } };

  state.starts.push(now);
  const job: MotionJob = { id: randomBytes(8).toString("hex"), state: "running", step: "copying", startedAt: now, inputs: req.inputs, controller: new AbortController() };
  state.jobs.set(job.id, job);
  state.running = job;

  const opts = state.options;
  const suggest = opts.suggest || suggestMotion;
  const deadline = setTimeout(() => {
    if (job.state === "running") {
      job.state = "failed";
      job.message = "It took too long.";
      job.finishedAt = Date.now();
    }
    job.controller.abort();
  }, opts.deadlineMs || MOTION_JOB_DEADLINE_MS);
  if (typeof deadline.unref === "function") deadline.unref();

  const input: SuggestMotionInput = {
    store: opts.store,
    url: req.url,
    ...(opts.profile && opts.project ? { profile: opts.profile, project: opts.project } : {}),
    viewport: "desktop",
    ...(req.inputs.selector !== undefined ? { selector: req.inputs.selector } : {}),
    ...(req.inputs.trigger !== undefined ? { trigger: req.inputs.trigger as "entrance" | "hover" | "scroll" } : {}),
    signal: job.controller.signal,
    owner: state.sessionId,
    onStep: (step) => { if (job.state === "running") job.step = step; },
  };

  state.work = (async () => {
    try {
      const result = await suggest(input);
      if (job.state !== "running" || job.controller.signal.aborted) {
        // A late result after the deadline or a stop: take back what it registered.
        for (const s of result.suggestions) if (s.playground_id) unregisterPlayground(s.playground_id);
        return;
      }
      for (const s of result.suggestions) {
        if (!s.playground_id) continue;
        state.owned.push(s.playground_id);
        while (state.owned.length > MOTION_MAX_PLAYGROUNDS) unregisterPlayground(state.owned.shift() as string);
      }
      job.result = result;
      job.state = "done";
    } catch (e) {
      if (job.state === "running") {
        job.state = job.controller.signal.aborted ? "cancelled" : "failed";
        job.message = plainFailure(e);
      }
    } finally {
      clearTimeout(deadline);
      if (job.finishedAt === undefined) job.finishedAt = Date.now();
      if (state.running === job) state.running = null;
      state.work = null;
    }
  })();

  return { status: 202, body: { job: job.id } };
}

/** The job as Grab sees it: no fragment, no timeline, no local path. */
export function readMotionJob(state: GrabMotionState, id: string): MotionReply {
  prune(state, Date.now());
  const job = state.jobs.get(id);
  if (!job) return { status: 404, body: { error: "No such motion job." } };
  // A job the deadline or a stop ended reports so, even while its work is still winding down.
  const body: Record<string, unknown> = { state: job.state, step: job.step, inputs: job.inputs, uses_taste: Boolean(state.options.profile && state.options.project) };
  if (job.message) body.message = job.message;
  if (job.state === "done" && job.result) {
    const r = job.result;
    body.suggestions = r.suggestions.map((s) => ({
      id: s.id, kind: s.kind, label: s.label, why: s.why, trigger_words: s.trigger_words,
      approximations: s.approximations, url: s.url, parts: s.parts,
    }));
    body.failed = r.failed.map((f) => ({ kind: f.kind, label: f.label, stage: f.stage }));
    if (r.message) body.message = r.message;
  }
  return { status: 200, body };
}

/** Tests: whether the session's job slot is taken (work still running). */
export function motionSlotTaken(state: GrabMotionState | undefined): boolean {
  return Boolean(state && state.running);
}
