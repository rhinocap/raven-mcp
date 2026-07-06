import { lookup } from "node:dns/promises";
import { readdir, rm, stat, statfs } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { connect as netConnect, isIP } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CaptureUnavailableError } from "./capture.js";
import { isRemoteRuntime } from "./remote-runtime.js";
import { isPrivateOrInternalAddress, remoteRequestShouldAbort } from "./remote-url-guard.js";

let activeBrowsers = 0;
const waiters: Array<() => void> = [];
let egressProxyPromise: Promise<{ port: number }> | null = null;

function ensureEgressProxy(): Promise<{ port: number }> {
  if (!egressProxyPromise) {
    egressProxyPromise = startEgressProxy();
  }
  return egressProxyPromise;
}

export async function validateAndResolve(
  host: string,
  port: number,
  resolver: (host: string) => Promise<{ address: string }[]> = function (h: string) {
    return lookup(h, { all: true });
  }
): Promise<{ ok: true; address: string } | { ok: false }> {
  const cache = new Map<string, { address: string }[]>();
  const resolve = async function (h: string): Promise<{ address: string }[]> {
    const r = await resolver(h);
    cache.set(h, r);
    return r;
  };
  const bracket = isIP(host) === 6 ? "[" + host + "]" : host;
  if (await remoteRequestShouldAbort("https://" + bracket + ":" + port + "/", resolve)) {
    return { ok: false };
  }
  if (isIP(host) !== 0) {
    return { ok: true, address: host };
  }
  const addrs = cache.get(host) ?? await resolve(host);
  const pub = addrs.map(function (a) {
    return a.address;
  }).find(function (a) {
    return !isPrivateOrInternalAddress(a);
  });
  return pub ? { ok: true, address: pub } : { ok: false };
}

export function splitHostPort(hostport: string): [string, string] {
  if (hostport.startsWith("[")) {
    const end = hostport.indexOf("]");
    const host = hostport.slice(1, end);
    const rest = hostport.slice(end + 1);
    const port = rest.startsWith(":") ? rest.slice(1) : "";
    return [host, port];
  }
  const idx = hostport.lastIndexOf(":");
  if (idx === -1) {
    return [hostport, ""];
  }
  return [hostport.slice(0, idx), hostport.slice(idx + 1)];
}

export function startEgressProxy(): Promise<{ port: number }> {
  return new Promise(function (resolveStart, rejectStart) {
    const server = createServer(function (creq, cres) {
      let target: URL;
      try {
        target = new URL(creq.url ?? "");
      } catch {
        cres.writeHead(400).end();
        return;
      }
      const port = Number(target.port) || 80;
      // Guard the async-validate window: a downstream (Chromium) close/abort while
      // DNS/validation is still pending fires BEFORE the teardown listeners below
      // exist, so record it via a flag and bail rather than open an upstream socket
      // that could leak an fd on the reused Fluid process (a streaming upstream never
      // trips the 30s idle timeout). The `creq 'error'` listener also closes a latent
      // unhandled-'error' window (no listener existed until inside .then()).
      let downstreamClosed = false;
      const markDownstreamClosed = function () {
        downstreamClosed = true;
      };
      cres.on("close", markDownstreamClosed);
      creq.on("error", markDownstreamClosed);
      validateAndResolve(target.hostname, port).then(function (v) {
        if (downstreamClosed) {
          return;
        }
        if (!v.ok) {
          cres.writeHead(403).end("blocked");
          return;
        }
        const headers = { ...creq.headers, host: target.host };
        const up = httpRequest(
          {
            host: v.address,
            port,
            method: creq.method,
            path: target.pathname + target.search,
            headers
          },
          function (ures) {
            cres.writeHead(ures.statusCode ?? 502, ures.headers);
            ures.pipe(cres);
          }
        );
        up.on("error", function () {
          if (!cres.headersSent) {
            cres.writeHead(502);
          }
          cres.end();
        });
        // Tear the upstream request down if the downstream (Chromium) side goes
        // away — an aborted/timed-out audit or the 30s idle-timeout destroying the
        // inbound socket must not leave an attacker-held upstream socket open on
        // the reused Fluid-Compute process (fd-exhaustion vector on a no-auth
        // endpoint). `close` on a completed response is a no-op destroy.
        up.setTimeout(30_000, function () {
          up.destroy();
        });
        const closeUpstream = function () {
          up.destroy();
        };
        cres.on("close", closeUpstream);
        creq.on("error", closeUpstream);
        creq.pipe(up);
      }).catch(function () {
        if (!cres.headersSent) {
          cres.writeHead(502);
        }
        cres.end();
      });
    });

    server.on("connect", function (req, sock, head) {
      const [host, portStr] = splitHostPort(req.url ?? "");
      const port = Number(portStr) || 443;
      // Guard the async-validate window (see the request handler): a client RST/close
      // while DNS is pending would otherwise hit a raw socket whose 'error' listener is
      // only attached inside .then() → uncaught exception → crash, and a late upstream
      // would leak an fd. Flag-and-bail closes both.
      let downstreamClosed = false;
      const markDownstreamClosed = function () {
        downstreamClosed = true;
      };
      sock.on("close", markDownstreamClosed);
      sock.on("error", markDownstreamClosed);
      validateAndResolve(host, port).then(function (v) {
        if (downstreamClosed) {
          return;
        }
        if (!v.ok) {
          try {
            sock.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          } catch {
            // Socket may already be gone.
          }
          sock.destroy();
          return;
        }
        const up = netConnect(port, v.address, function () {
          sock.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head && head.length) {
            up.write(head);
          }
          up.pipe(sock);
          sock.pipe(up);
        });
        // Mutual teardown: destroying either end must destroy the other, on BOTH
        // close and error (pipe() only forwards end, never destroy). Without the
        // `close` handlers an attacker-held idle upstream tunnel/WebSocket lingers
        // after the downstream socket is gone (fd leak on the reused process). The
        // upstream idle timeout backstops a peer that connects then holds silently.
        up.setTimeout(30_000, function () {
          up.destroy();
        });
        up.on("error", function () {
          sock.destroy();
        });
        up.on("close", function () {
          sock.destroy();
        });
        sock.on("error", function () {
          up.destroy();
        });
        sock.on("close", function () {
          up.destroy();
        });
      }).catch(function () {
        try {
          sock.write("HTTP/1.1 502\r\n\r\n");
        } catch {
          // Socket may already be gone.
        }
        sock.destroy();
      });
    });

    server.on("upgrade", function (req, sock, head) {
      let target: URL;
      try {
        target = new URL(req.url ?? "");
      } catch {
        sock.destroy();
        return;
      }
      const port = Number(target.port) || 80;
      // Guard the async-validate window (see the request handler): flag a downstream
      // close/error during DNS and bail, closing both the fd-leak and the latent
      // unhandled-'error' crash window on the raw socket.
      let downstreamClosed = false;
      const markDownstreamClosed = function () {
        downstreamClosed = true;
      };
      sock.on("close", markDownstreamClosed);
      sock.on("error", markDownstreamClosed);
      validateAndResolve(target.hostname, port).then(function (v) {
        if (downstreamClosed) {
          return;
        }
        if (!v.ok) {
          try {
            sock.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          } catch {
            // Socket may already be gone.
          }
          sock.destroy();
          return;
        }
        const up = netConnect(port, v.address, function () {
          let out = (req.method ?? "GET") + " " + target.pathname + target.search + " HTTP/1.1\r\n";
          for (let i = 0; i < req.rawHeaders.length; i += 2) {
            out += req.rawHeaders[i] + ": " + req.rawHeaders[i + 1] + "\r\n";
          }
          out += "\r\n";
          up.write(out);
          if (head && head.length) {
            up.write(head);
          }
          up.pipe(sock);
          sock.pipe(up);
        });
        // Mutual teardown: destroying either end must destroy the other, on BOTH
        // close and error (pipe() only forwards end, never destroy). Without the
        // `close` handlers an attacker-held idle upstream tunnel/WebSocket lingers
        // after the downstream socket is gone (fd leak on the reused process). The
        // upstream idle timeout backstops a peer that connects then holds silently.
        up.setTimeout(30_000, function () {
          up.destroy();
        });
        up.on("error", function () {
          sock.destroy();
        });
        up.on("close", function () {
          sock.destroy();
        });
        sock.on("error", function () {
          up.destroy();
        });
        sock.on("close", function () {
          up.destroy();
        });
      }).catch(function () {
        try {
          sock.write("HTTP/1.1 502\r\n\r\n");
        } catch {
          // Socket may already be gone.
        }
        sock.destroy();
      });
    });

    server.on("connection", function (s) {
      s.setTimeout(30_000, function () {
        s.destroy();
      });
    });
    server.listen(0, "127.0.0.1", function () {
      const address = server.address();
      if (address && typeof address === "object") {
        resolveStart({ port: address.port });
        return;
      }
      rejectStart(new Error("Egress proxy did not bind to a TCP port"));
    });
    server.on("error", rejectStart);
  });
}

export async function launchAuditChromium(): Promise<import("playwright").Browser> {
  if (!isRemoteRuntime()) {
    // Separate the import failure from the launch failure so the stdio path stays
    // byte-for-byte identical to the pre-Phase-3 behaviour: loadChromium() threw
    // CaptureUnavailableError on a missing module, but the raw chromium.launch()
    // error propagated unwrapped to callers (capture.ts surfaces it in the file://
    // fallback warning). Wrapping both into CaptureUnavailableError would change
    // that warning's text in the degraded local case.
    let playwright: typeof import("playwright");
    try {
      playwright = await import("playwright");
    } catch {
      throw new CaptureUnavailableError();
    }
    return await playwright.chromium.launch({ headless: true });
  }

  await sweepStaleTmpEntries();
  const release = await acquireBrowserSlot();
  try {
    const { chromium } = await import("playwright-core");
    const sparticuz = (await import("@sparticuz/chromium")).default;
    const proxy = await ensureEgressProxy();
    const browser = await chromium.launch({
      args: sparticuz.args.filter(function (arg: string) {
        return !arg.startsWith("--headless");
      }).concat([
        "--proxy-bypass-list=<-loopback>",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--disable-quic"
      ]),
      executablePath: await sparticuz.executablePath(),
      headless: true,
      proxy: { server: "http://127.0.0.1:" + proxy.port, bypass: "" }
    });
    return wrapRemoteBrowser(browser, release);
  } catch (error) {
    release();
    throw error;
  }
}

async function sweepStaleTmpEntries(): Promise<void> {
  const root = tmpdir();
  const cutoff = Date.now() - (10 * 60 * 1000);
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }

  for (let i = 0; i < entries.length; i++) {
    const name = entries[i];
    if (!name.startsWith("playwright") && !name.startsWith(".org.chromium.")) {
      continue;
    }
    const fullPath = join(root, name);
    try {
      const info = await stat(fullPath);
      if (info.mtimeMs <= cutoff) {
        await rm(fullPath, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup only.
    }
  }
}

async function acquireBrowserSlot(): Promise<() => void> {
  const cap = browserConcurrencyCap();
  const deadline = Date.now() + 120_000;

  while (activeBrowsers >= cap) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error("Hosted browser capacity busy — retry shortly");
    }
    await new Promise<void>(function (resolve, reject) {
      const waiter = function () {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(function () {
        removeWaiter(waiter);
        reject(new Error("Hosted browser capacity busy — retry shortly"));
      }, remaining);
      waiters.push(waiter);
    });
  }

  activeBrowsers++;
  let released = false;
  return function releaseBrowserSlot() {
    if (released) {
      return;
    }
    released = true;
    activeBrowsers = Math.max(0, activeBrowsers - 1);
    const next = waiters.shift();
    if (next) {
      next();
    }
  };
}

function browserConcurrencyCap(): number {
  const parsed = Number(process.env.RAVEN_BROWSER_MAX_CONCURRENCY || "2");
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 2;
  }
  return Math.floor(parsed);
}

function removeWaiter(waiter: () => void): void {
  for (let i = 0; i < waiters.length; i++) {
    if (waiters[i] === waiter) {
      waiters.splice(i, 1);
      return;
    }
  }
}

function wrapRemoteBrowser(
  browser: import("playwright-core").Browser,
  release: () => void
): import("playwright").Browser {
  const originalNewPage = browser.newPage.bind(browser);
  const originalClose = browser.close.bind(browser);
  const dnsCache = new Map<string, { address: string }[]>();
  const cachedLookup = async function (host: string): Promise<{ address: string }[]> {
    const cached = dnsCache.get(host);
    if (cached) {
      return cached;
    }
    const result = await lookup(host, { all: true });
    dnsCache.set(host, result);
    return result;
  };

  (browser as any).newPage = async function () {
    const page = await originalNewPage({ serviceWorkers: "block" });
    await page.route("**/*", async function (route) {
      try {
        if (await remoteRequestShouldAbort(route.request().url(), cachedLookup)) {
          await route.abort();
          return;
        }
      } catch {
        await route.abort();
        return;
      }
      await route.continue();
    });
    return page;
  };

  (browser as any).close = async function () {
    try {
      return await originalClose();
    } finally {
      release();
      await logTmpUsage();
    }
  };

  return browser as unknown as import("playwright").Browser;
}

async function logTmpUsage(): Promise<void> {
  try {
    const stats = await statfs(tmpdir());
    const usedBytes = Number(stats.blocks - stats.bfree) * Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    console.log("[raven-mcp] tmp used " + usedBytes + " / " + totalBytes + " bytes");
  } catch {
    // Remote-only observability; never affect a tool result.
  }
}
