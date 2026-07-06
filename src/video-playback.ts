/**
 * video-playback.ts — Video playback audit module for audit_video_playback tool.
 * Pure classifier + Playwright-backed page observer.
 * No new npm dependencies required.
 */

import { CaptureUnavailableError } from "./capture.js";
import { launchAuditChromium } from "./browser-launch.js";

export { CaptureUnavailableError };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoObservation = {
  selector: string;
  hasSource: boolean;          // currentSrc non-empty OR a <source>/src present
  readyState: number;          // 0..4 (HTMLMediaElement.readyState)
  networkState: number;        // 0..3 (3 = NETWORK_NO_SOURCE)
  errorCode: number;           // 0 = none, 1..4 = MEDIA_ERR_*
  paused: boolean;
  autoplayBlocked: boolean;    // play() rejected with NotAllowedError
  currentTimeStart: number;
  currentTimeEnd: number;
};

export type VideoClassification = {
  selector: string;
  state: "playing" | "paused" | "stalled" | "empty" | "error";
  reason: string;
  advanced: boolean;
};

export type VideoRow = VideoClassification & {
  readyState: number;
  errorCode: number;
  paused: boolean;
  currentTimeStart: number;
  currentTimeEnd: number;
};

export type VideoPlaybackResult = {
  url: string | null;          // null when classifying a dom_snapshot (no page was rendered)
  total_videos: number;
  rows: VideoRow[];
  playing_count: number;
  not_playing_count: number;
  not_playing: VideoRow[];
  summary: string;
};

// ---------------------------------------------------------------------------
// Pure classifier — exported for tests, no I/O
// ---------------------------------------------------------------------------

/**
 * Classify a single VideoObservation into a state+reason pair.
 * First-match-wins order per SPEC:
 *   1. error  — errorCode > 0
 *   2. empty  — hasSource === false OR networkState === 3
 *   3. playing — currentTimeEnd - currentTimeStart > 1e-3 AND paused === false
 *   4. paused  — readyState >= 3 AND not advancing
 *   5. stalled — fallthrough
 */
export function classifyVideoPlayback(obs: VideoObservation): VideoClassification {
  const advanced = obs.currentTimeEnd - obs.currentTimeStart > 1e-3;

  // 1. error
  if (obs.errorCode > 0) {
    const reasonMap: Record<number, string> = {
      1: "aborted",
      2: "network-error",
      3: "decode-error",
      4: "src-not-supported",
    };
    const reason = reasonMap[obs.errorCode] ?? "unknown-error";
    return { selector: obs.selector, state: "error", reason, advanced };
  }

  // 2. empty
  if (!obs.hasSource || obs.networkState === 3) {
    return { selector: obs.selector, state: "empty", reason: "empty-src", advanced };
  }

  // 3. playing
  if (advanced && !obs.paused) {
    return { selector: obs.selector, state: "playing", reason: "advancing", advanced };
  }

  // 4. paused
  if (obs.readyState >= 3) {
    const reason = obs.autoplayBlocked ? "autoplay-blocked" : "paused";
    return { selector: obs.selector, state: "paused", reason, advanced };
  }

  // 5. stalled (fallthrough)
  return { selector: obs.selector, state: "stalled", reason: "buffering-or-stalled", advanced };
}

// ---------------------------------------------------------------------------
// Pure aggregator — exported for tests, no I/O. Single source of truth for the
// VideoPlaybackResult shape, shared by the browser path and the dom_snapshot
// handler (mirrors contrast.ts's auditContrastSnapshot).
// ---------------------------------------------------------------------------

export function auditVideoPlaybackSnapshot(
  observations: VideoObservation[],
  url: string | null = null
): VideoPlaybackResult {
  const rows: VideoRow[] = observations.map((obs) => {
    const classification = classifyVideoPlayback(obs);
    return {
      ...classification,
      readyState: obs.readyState,
      errorCode: obs.errorCode,
      paused: obs.paused,
      currentTimeStart: obs.currentTimeStart,
      currentTimeEnd: obs.currentTimeEnd,
    };
  });

  const total_videos = rows.length;
  const playing_count = rows.filter((r) => r.state === "playing").length;
  const not_playing = rows.filter((r) => r.state !== "playing");
  const not_playing_count = not_playing.length;

  const summary =
    total_videos === 0
      ? "No <video> elements found."
      : `${playing_count}/${total_videos} video(s) playing; ${not_playing_count} not playing (${not_playing.map((r) => r.state).join(", ") || "none"}).`;

  return {
    url,
    total_videos,
    rows,
    playing_count,
    not_playing_count,
    not_playing,
    summary,
  };
}

// ---------------------------------------------------------------------------
// URL audit (Playwright)
// ---------------------------------------------------------------------------

/**
 * Render a URL in headless Chromium, locate every <video>, observe whether
 * playback actually advances (samples currentTime before/after a play attempt),
 * classify each clip, and return a VideoPlaybackResult.
 *
 * Throws CaptureUnavailableError when chromium is unavailable.
 */
export async function auditVideoPlaybackUrl(
  url: string,
  opts?: { observeMs?: number }
): Promise<VideoPlaybackResult> {
  const observeMs = opts?.observeMs ?? 1000;

  let browser: import("playwright").Browser | null = null;

  try {
    try {
      browser = await launchAuditChromium();
    } catch {
      throw new CaptureUnavailableError(
        "Playwright chromium not available. Run: npx playwright install chromium"
      );
    }

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "load" });

    // Collect raw observation data from the page (plain serializable objects only)
    type RawVideoData = {
      selector: string;
      hasSource: boolean;
      readyState: number;
      networkState: number;
      errorCode: number;
      paused: boolean;
      autoplayBlocked: boolean;
      currentTimeStart: number;
    };

    // Step 1: collect initial state + currentTimeStart, then call play() for each video
    const initialData: RawVideoData[] = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll("video"));
      return videos.map((el, k) => {
        // Build a stable-ish selector
        const id = el.getAttribute("id");
        const cls = el.className ? "." + el.className.trim().split(/\s+/).join(".") : "";
        const selector = id ? `#${id}` : `video:nth-of-type(${k + 1})${cls}`;

        const hasSource =
          (el.currentSrc !== undefined && el.currentSrc !== "") ||
          el.getAttribute("src") !== null ||
          el.querySelector("source") !== null;

        return {
          selector,
          hasSource,
          readyState: el.readyState,
          networkState: el.networkState,
          errorCode: el.error ? el.error.code : 0,
          paused: el.paused,
          autoplayBlocked: false,
          currentTimeStart: el.currentTime,
        };
      });
    });

    // Step 2: attempt play() for each video, detect NotAllowedError
    const autoplayBlocked: boolean[] = [];
    const videoCount = initialData.length;
    for (let k = 0; k < videoCount; k++) {
      const blocked = await page.evaluate((idx: number) => {
        const videos = Array.from(document.querySelectorAll("video"));
        const el = videos[idx];
        if (!el) return false;
        return el.play().then(
          () => false,
          (err: Error) => {
            return (
              err.name === "NotAllowedError" ||
              (err.message !== undefined &&
                err.message.toLowerCase().indexOf("notallowed") !== -1)
            );
          }
        );
      }, k);
      autoplayBlocked.push(blocked as boolean);
    }

    // Step 3: wait observeMs
    await page.waitForTimeout(observeMs);

    // Step 4: collect final state
    type FinalVideoData = {
      readyState: number;
      networkState: number;
      errorCode: number;
      paused: boolean;
      currentTimeEnd: number;
      hasSource: boolean;
    };

    const finalData: FinalVideoData[] = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll("video"));
      return videos.map((el) => {
        const hasSource =
          (el.currentSrc !== undefined && el.currentSrc !== "") ||
          el.getAttribute("src") !== null ||
          el.querySelector("source") !== null;
        return {
          readyState: el.readyState,
          networkState: el.networkState,
          errorCode: el.error ? el.error.code : 0,
          paused: el.paused,
          currentTimeEnd: el.currentTime,
          hasSource,
        };
      });
    });

    // Step 5: assemble observations and classify in Node (pure classifier, not in page)
    const observations: VideoObservation[] = initialData.map((init, k) => {
      const fin = finalData[k] ?? {
        readyState: init.readyState,
        networkState: init.networkState,
        errorCode: init.errorCode,
        paused: init.paused,
        currentTimeEnd: init.currentTimeStart,
        hasSource: init.hasSource,
      };
      return {
        selector: init.selector,
        hasSource: fin.hasSource,
        readyState: fin.readyState,
        networkState: fin.networkState,
        errorCode: fin.errorCode,
        paused: fin.paused,
        autoplayBlocked: autoplayBlocked[k] ?? false,
        currentTimeStart: init.currentTimeStart,
        currentTimeEnd: fin.currentTimeEnd,
      };
    });

    return auditVideoPlaybackSnapshot(observations, url);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
