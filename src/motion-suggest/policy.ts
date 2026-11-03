// Request policy for suggest_motion (Site Motion Spec, Revisions 2 and 3).
//
// Capture: every request the page makes goes through Playwright route
// interception. A page on a public origin may not reach loopback, private,
// link-local or metadata addresses; a page on a local origin (a dev server the
// designer pointed at) may reach only its own origin and public addresses.
// Playwright does not call a route handler for redirect hops, so the handler
// fetches each request itself without following redirects, checks every hop,
// and fulfils the browser with the final response.
//
// Fonts: fetched in Node, from the page's own origin or a public https address,
// with the host resolved first and the connection pinned to the checked
// address, redirects followed by hand (at most 3, each checked), a 2 MB cap
// enforced while reading, and a font signature sniff before caching.

import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { lstat, mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { join } from "node:path";
import { isPrivateOrInternalAddress } from "../remote-url-guard.js";

/** What a hostname is: local (loopback/private/link-local/metadata) or public, and where it resolves. */
export type HostInfo = { local: boolean; addresses: string[] };
/** Classifies a hostname. Injected in tests so no real network is needed. */
export type HostClassifier = (hostname: string) => Promise<HostInfo>;

const MAX_POLICY_WARNINGS = 20;
const MAX_REDIRECT_HOPS = 5;

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/**
 * Default classifier: `localhost` and `*.localhost` are local; an IP literal is
 * local when it is loopback, private, link-local, metadata or otherwise
 * internal; a name is resolved and is local when ANY address it resolves to is
 * internal. A name that does not resolve throws.
 */
export async function defaultClassifyHost(hostname: string): Promise<HostInfo> {
  const host = stripBrackets(hostname).toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { local: true, addresses: ["127.0.0.1"] };
  }
  if (isIP(host) !== 0) {
    return { local: isPrivateOrInternalAddress(host), addresses: [host] };
  }
  const found = await lookup(host, { all: true });
  const addresses = found.map(function (a) { return a.address; });
  if (addresses.length === 0) throw new Error("no addresses");
  return {
    local: addresses.some(function (a) { return isPrivateOrInternalAddress(a); }),
    addresses: addresses
  };
}

/** suggest_motion accepts http: and https: page URLs only. Returns a plain message, or null when acceptable. */
export function captureUrlError(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That address could not be read as a URL.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Motion suggestions work on http and https pages only.";
  }
  if (url.hostname === "") return "That address has no host.";
  return null;
}

export type RequestDecision = { allow: true } | { allow: false; reason: string };

/**
 * The pure capture rule. `pageOrigin`/`pageLocal` describe the requested URL;
 * `targetLocal` is the classification of the request's host.
 */
export function decideRequest(
  target: URL,
  pageOrigin: string,
  pageLocal: boolean,
  targetLocal: boolean
): RequestDecision {
  const protocol = target.protocol;
  const isWs = protocol === "ws:" || protocol === "wss:";
  if (protocol !== "http:" && protocol !== "https:" && !isWs) {
    return { allow: false, reason: "it is not an http or https address" };
  }
  // Compare websocket origins as their http equivalent.
  const origin = isWs
    ? (protocol === "wss:" ? "https://" : "http://") + target.host
    : target.origin;
  if (pageLocal) {
    if (origin === pageOrigin) return { allow: true };
    if (!targetLocal) return { allow: true };
    return { allow: false, reason: "a local page may reach only its own origin and public addresses" };
  }
  if (!targetLocal) return { allow: true };
  return { allow: false, reason: "a public page may not reach local or private addresses" };
}

type RouteLike = {
  request: () => {
    url: () => string;
    isNavigationRequest: () => boolean;
    frame: () => unknown;
  };
  fetch: (options?: { url?: string; maxRedirects?: number; method?: string; postData?: string | Buffer }) => Promise<{
    status: () => number;
    headers: () => Record<string, string>;
  }>;
  fulfill: (options: { response?: unknown }) => Promise<void>;
  abort: (errorCode?: string) => Promise<void>;
};

type WebSocketRouteLike = {
  url: () => string;
  connectToServer: () => unknown;
  close: (options?: { code?: number; reason?: string }) => Promise<void>;
};

type PolicyPageLike = {
  route?: (url: string | RegExp, handler: (route: RouteLike) => Promise<void>) => Promise<void>;
  routeWebSocket?: (url: string | RegExp, handler: (ws: WebSocketRouteLike) => Promise<void> | void) => Promise<void>;
  addInitScript?: (script: string | (() => void)) => Promise<void>;
  mainFrame?: () => unknown;
  context?: () => {
    route?: (url: string | RegExp, handler: (route: RouteLike) => Promise<void>) => Promise<void>;
    routeWebSocket?: (url: string | RegExp, handler: (ws: WebSocketRouteLike) => Promise<void> | void) => Promise<void>;
    addInitScript?: (script: string | (() => void)) => Promise<void>;
  };
};

export type CapturePolicy = {
  /** Installs the interception on a Playwright page. Pass as `capturePage`'s `beforeNavigate`. */
  install: (page: unknown) => Promise<void>;
  /** Plain sentences, one per refused origin, in the order refused. */
  warnings: string[];
  /** Every refused request URL, for tests and logs. Not for any page or playground. */
  refused: string[];
};

export type CapturePolicyOptions = { classifyHost?: HostClassifier };

/**
 * Builds the capture policy for one requested URL. Throws when the URL is not
 * http(s). Install it before navigation (capturePage's `beforeNavigate`).
 */
export async function createCapturePolicy(
  requestedUrl: string,
  opts: CapturePolicyOptions = {}
): Promise<CapturePolicy> {
  const urlError = captureUrlError(requestedUrl);
  if (urlError !== null) throw new Error(urlError);
  const requested = new URL(requestedUrl);
  const pageOrigin = requested.origin;
  const classify = opts.classifyHost || defaultClassifyHost;
  const pageLocal = (await classify(requested.hostname)).local;
  const cache = new Map<string, Promise<boolean | null>>();
  const warnings: string[] = [];
  const refused: string[] = [];
  const warnedOrigins = new Set<string>();

  function hostLocal(hostname: string): Promise<boolean | null> {
    const key = stripBrackets(hostname).toLowerCase();
    let p = cache.get(key);
    if (!p) {
      p = classify(key).then(function (info) { return info.local; }, function () { return null; });
      cache.set(key, p);
    }
    return p;
  }

  async function check(raw: string): Promise<RequestDecision> {
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return { allow: false, reason: "it is not a valid address" };
    }
    if (target.protocol !== "http:" && target.protocol !== "https:" &&
        target.protocol !== "ws:" && target.protocol !== "wss:") {
      return decideRequest(target, pageOrigin, pageLocal, true);
    }
    const local = await hostLocal(target.hostname);
    if (local === null) return { allow: false, reason: "its host could not be resolved" };
    return decideRequest(target, pageOrigin, pageLocal, local);
  }

  function refuse(raw: string, reason: string): void {
    refused.push(raw);
    let origin = raw;
    try { origin = new URL(raw).origin; } catch { /* keep raw */ }
    if (origin === "null") origin = raw.split(":")[0] + ":";
    if (warnedOrigins.has(origin) || warnings.length >= MAX_POLICY_WARNINGS) return;
    warnedOrigins.add(origin);
    warnings.push("A request from the page to " + origin.slice(0, 120) + " was blocked, because " + reason + ".");
  }

  async function handle(route: RouteLike): Promise<void> {
    const request = route.request();
    let current = request.url();
    let decision = await check(current);
    if (!decision.allow) {
      refuse(current, decision.reason);
      await route.abort("blockedbyclient").catch(function () {});
      return;
    }
    let response;
    try {
      response = await route.fetch({ maxRedirects: 0 });
      for (let hop = 0; ; hop++) {
        const status = response.status();
        const location = response.headers()["location"];
        if (status < 300 || status >= 400 || !location) break;
        if (hop >= MAX_REDIRECT_HOPS) {
          refuse(current, "it redirected too many times");
          await route.abort("blockedbyclient").catch(function () {});
          return;
        }
        const next = new URL(location, current).href;
        decision = await check(next);
        if (!decision.allow) {
          refuse(next, decision.reason);
          await route.abort("blockedbyclient").catch(function () {});
          return;
        }
        // A redirect of a frame navigation cannot be replayed under its new URL
        // without letting the browser follow it unchecked, so the redirect is
        // refused there. The caller resolves the top-level URL's redirects with
        // resolveCaptureRedirects() before capture.
        if (request.isNavigationRequest()) {
          refuse(next, "a page navigation redirected during capture");
          await route.abort("blockedbyclient").catch(function () {});
          return;
        }
        current = next;
        response = await route.fetch({ url: next, maxRedirects: 0, method: status === 303 ? "GET" : undefined });
      }
    } catch {
      await route.abort("failed").catch(function () {});
      return;
    }
    await route.fulfill({ response: response }).catch(function () {});
  }

  async function handleSocket(ws: WebSocketRouteLike): Promise<void> {
    const decision = await check(ws.url());
    if (!decision.allow) {
      refuse(ws.url(), decision.reason);
      await ws.close({ code: 1008, reason: "blocked" }).catch(function () {});
      return;
    }
    ws.connectToServer();
  }

  async function install(rawPage: unknown): Promise<void> {
    const page = rawPage as PolicyPageLike;
    const ctx = typeof page.context === "function" ? page.context() : null;
    // The context covers popups opened from the page as well as the page itself.
    const target = ctx && typeof ctx.route === "function" ? ctx : page;
    if (typeof target.route !== "function") throw new Error("The capture page cannot intercept requests.");
    await target.route("**/*", handle);
    if (typeof target.routeWebSocket === "function") {
      await target.routeWebSocket(/.*/, handleSocket);
    }
    // Service-worker fetches bypass route interception; stop the page registering one.
    const init = ctx && typeof ctx.addInitScript === "function" ? ctx : page;
    if (typeof init.addInitScript === "function") {
      await init.addInitScript(
        "(function(){try{if(navigator.serviceWorker){Object.defineProperty(navigator.serviceWorker,'register',{value:function(){return Promise.reject(new Error('blocked'))}});}}catch(e){}})();"
      );
    }
  }

  return { install: install, warnings: warnings, refused: refused };
}

/**
 * Follows the requested URL's redirects by hand before capture (at most 5),
 * checking each hop against the same rule a local or public page would get,
 * and returns the URL to capture. The first URL sets the rule. Returns
 * {url} or {error} in plain words.
 */
export async function resolveCaptureRedirects(
  requestedUrl: string,
  opts: CapturePolicyOptions & { timeoutMs?: number } = {}
): Promise<{ url: string } | { error: string }> {
  const urlError = captureUrlError(requestedUrl);
  if (urlError !== null) return { error: urlError };
  const classify = opts.classifyHost || defaultClassifyHost;
  const first = new URL(requestedUrl);
  let info: HostInfo;
  try {
    info = await classify(first.hostname);
  } catch {
    return { error: "The page's host could not be resolved." };
  }
  const pageLocal = info.local;
  let current = first;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let hostInfo: HostInfo;
    try {
      hostInfo = hop === 0 ? info : await classify(current.hostname);
    } catch {
      return { error: "A redirect pointed at a host that could not be resolved." };
    }
    const decision = decideRequest(current, first.origin, pageLocal, hostInfo.local);
    if (!decision.allow) return { error: "The page redirected somewhere it may not go, because " + decision.reason + "." };
    let res: { status: number; location?: string };
    try {
      res = await headOrGet(current, hostInfo.addresses[0], opts.timeoutMs || 15000);
    } catch (error) {
      return { error: "The page could not be reached: " + (error instanceof Error ? error.message : String(error)) };
    }
    if (res.status >= 300 && res.status < 400 && res.location) {
      current = new URL(res.location, current);
      continue;
    }
    return { url: current.href };
  }
  return { error: "The page redirected too many times." };
}

async function headOrGet(url: URL, address: string, timeoutMs: number): Promise<{ status: number; location?: string }> {
  const res = await pinnedRequest(url, address, timeoutMs, { accept: "text/html,*/*" });
  const out = { status: res.statusCode || 0, location: headerString(res.headers.location) };
  res.destroy();
  return out;
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pinnedRequest(
  url: URL,
  address: string,
  timeoutMs: number,
  headers: Record<string, string>
): Promise<IncomingMessage> {
  return new Promise(function (resolve, reject) {
    const family = isIP(address) === 6 ? 6 : 4;
    // Pin the connection to the address that was checked, so a second DNS
    // answer cannot point the request somewhere else.
    const pinnedLookup = function (_host: string, options: any, cb: any): void {
      if (typeof options === "function") cb = options;
      if (options && options.all) cb(null, [{ address: address, family: family }]);
      else cb(null, address, family);
    };
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        headers: Object.assign({ "user-agent": "raven-mcp motion font fetch" }, headers),
        lookup: pinnedLookup as any,
        timeout: timeoutMs
      },
      resolve
    );
    req.on("timeout", function () { req.destroy(new Error("timed out")); });
    req.on("error", reject);
    req.end();
  });
}

// ── Fonts ──────────────────────────────────────────────────────────────────

export const FONT_MAX_BYTES = 2 * 1024 * 1024;
export const FONT_MAX_REDIRECTS = 3;

export type FontFetchOptions = {
  /** Directory the font cache lives in (the taste home's `fonts/`). Created when missing. */
  cacheDir: string;
  classifyHost?: HostClassifier;
  /** Default 2 MB. */
  maxBytes?: number;
  /** Default 15 s per hop. */
  timeoutMs?: number;
};

export type FontFetchResult = { path: string } | { error: string };

/** Returns the file extension for a recognised font signature, or null. */
export function sniffFont(bytes: Uint8Array): "ttf" | "otf" | "woff" | "woff2" | null {
  if (bytes.length < 4) return null;
  const a = bytes[0], b = bytes[1], c = bytes[2], d = bytes[3];
  if (a === 0x00 && b === 0x01 && c === 0x00 && d === 0x00) return "ttf";
  if (a === 0x74 && b === 0x72 && c === 0x75 && d === 0x65) return "ttf"; // 'true'
  if (a === 0x4f && b === 0x54 && c === 0x54 && d === 0x4f) return "otf"; // 'OTTO'
  if (a === 0x77 && b === 0x4f && c === 0x46 && d === 0x46) return "woff"; // 'wOFF'
  if (a === 0x77 && b === 0x4f && c === 0x46 && d === 0x32) return "woff2"; // 'wOF2'
  return null;
}

/**
 * Fetches a page's @font-face source into the cache and returns its absolute
 * path, or a plain error. Allowed: the requested page's own origin (http or
 * https), or a public https address. A host that resolves to a local address
 * is refused unless the font is on the requested local origin.
 */
export async function fetchFont(url: string, pageOrigin: string, opts: FontFetchOptions): Promise<FontFetchResult> {
  const maxBytes = typeof opts.maxBytes === "number" && opts.maxBytes > 0 ? opts.maxBytes : FONT_MAX_BYTES;
  const timeoutMs = typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : 15000;
  const classify = opts.classifyHost || defaultClassifyHost;
  let current: URL;
  let page: URL;
  try {
    current = new URL(url);
    page = new URL(pageOrigin);
  } catch {
    return { error: "The font address could not be read." };
  }
  const origin = page.origin;
  const key = createHash("sha256").update(url).digest("hex");

  const cached = await readCached(opts.cacheDir, key, maxBytes);
  if (cached !== null) return { path: cached };

  let pageLocal: boolean;
  try {
    pageLocal = (await classify(page.hostname)).local;
  } catch {
    return { error: "The page's host could not be resolved." };
  }

  for (let hop = 0; hop <= FONT_MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      return { error: "The font is not on an http or https address." };
    }
    let info: HostInfo;
    try {
      info = await classify(current.hostname);
    } catch {
      return { error: "The font's host could not be resolved." };
    }
    const sameOrigin = current.origin === origin;
    if (info.local && !(sameOrigin && pageLocal)) {
      return { error: "The font points at a local or private address, which only the page's own local server may use." };
    }
    if (!info.local && !sameOrigin && current.protocol !== "https:") {
      return { error: "A font from another site is fetched over https only." };
    }
    if (info.addresses.length === 0) return { error: "The font's host has no address." };

    let res: IncomingMessage;
    try {
      res = await pinnedRequest(current, info.addresses[0], timeoutMs, { accept: "font/woff2,font/woff,font/ttf,font/otf,*/*;q=0.1" });
    } catch (error) {
      return { error: "The font could not be downloaded: " + (error instanceof Error ? error.message : String(error)) + "." };
    }
    const status = res.statusCode || 0;
    if (status >= 300 && status < 400) {
      const location = headerString(res.headers.location);
      res.destroy();
      if (!location) return { error: "The font server redirected without saying where." };
      if (hop === FONT_MAX_REDIRECTS) return { error: "The font redirected more than " + FONT_MAX_REDIRECTS + " times." };
      try {
        current = new URL(location, current);
      } catch {
        return { error: "The font server redirected to an unreadable address." };
      }
      continue;
    }
    if (status !== 200) {
      res.destroy();
      return { error: "The font server answered " + status + "." };
    }
    const declared = Number(headerString(res.headers["content-length"]));
    if (Number.isFinite(declared) && declared > maxBytes) {
      res.destroy();
      return { error: "The font is larger than " + Math.round(maxBytes / 1024 / 1024) + " MB." };
    }
    let body: Buffer;
    try {
      body = await readCapped(res, maxBytes, timeoutMs);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    const ext = sniffFont(body);
    if (ext === null) return { error: "The file is not a font." };
    try {
      await mkdir(opts.cacheDir, { recursive: true });
      const finalPath = join(opts.cacheDir, key + "." + ext);
      const tmpPath = join(opts.cacheDir, "." + key + "." + randomBytes(6).toString("hex") + ".tmp");
      await writeFile(tmpPath, body, { flag: "wx", mode: 0o600 });
      try {
        await rename(tmpPath, finalPath);
      } catch (error) {
        await unlink(tmpPath).catch(function () {});
        throw error;
      }
      return { path: finalPath };
    } catch (error) {
      return { error: "The font could not be saved: " + (error instanceof Error ? error.message : String(error)) + "." };
    }
  }
  return { error: "The font redirected more than " + FONT_MAX_REDIRECTS + " times." };
}

function readCapped(res: IncomingMessage, maxBytes: number, timeoutMs: number): Promise<Buffer> {
  return new Promise(function (resolve, reject) {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    const timer = setTimeout(function () {
      finish(new Error("The font download timed out."));
    }, timeoutMs);
    function finish(error: Error | null): void {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        res.destroy();
        reject(error);
      } else {
        resolve(Buffer.concat(chunks, total));
      }
    }
    res.on("data", function (chunk: Buffer) {
      total += chunk.length;
      if (total > maxBytes) {
        finish(new Error("The font is larger than " + Math.round(maxBytes / 1024 / 1024) + " MB."));
        return;
      }
      chunks.push(chunk);
    });
    res.on("end", function () { finish(null); });
    res.on("error", function (e) { finish(e); });
    res.on("aborted", function () { finish(new Error("The font download was cut off.")); });
  });
}

async function readCached(dir: string, key: string, maxBytes: number): Promise<string | null> {
  for (const ext of ["woff2", "woff", "ttf", "otf"]) {
    const p = join(dir, key + "." + ext);
    try {
      const st = await lstat(p);
      if (!st.isFile() || st.size > maxBytes || st.size < 4) continue;
      const head = (await readFile(p)).subarray(0, 4);
      if (sniffFont(head) !== null) return p;
    } catch {
      // not cached
    }
  }
  return null;
}
