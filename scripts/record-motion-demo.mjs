#!/usr/bin/env node
// Records the home page's Motion Playground demo video from /motion.
//
//   node scripts/record-motion-demo.mjs            # starts `next start` on loopback (run `next build` in web/ first)
//   node scripts/record-motion-demo.mjs --url http://127.0.0.1:4321
//   node scripts/record-motion-demo.mjs --keep-frames /tmp/frames   # keeps the raw frames and step times
//
// Writes web/public/motion-demo.mp4 (H.264, yuv420p, faststart, no audio, 1600x900, 30fps)
// and web/public/motion-demo-poster.jpg (frame 0). Frames come from a Chrome DevTools
// screencast rather than Playwright's video recorder, which encodes at a low bitrate.
// Playwright video has no pointer, so a cursor is drawn into the page for the recording.

import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, statSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'web')
const OUT_MP4 = join(WEB, 'public', 'motion-demo.mp4')
const OUT_POSTER = join(WEB, 'public', 'motion-demo-poster.jpg')
const W = 1600
const H = 900
const FPS = 30
const MAX_BYTES = 7 * 1024 * 1024
const LOOP_FADE = 0.5 // seconds the last shot fades into frame 0, so the loop has no jump

const args = process.argv.slice(2)
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
let baseUrl = argValue('--url')
const keepFrames = argValue('--keep-frames')

function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer()
    s.unref()
    s.on('error', fail)
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
  })
}

async function startServer() {
  const port = await freePort()
  const child = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: WEB, stdio: ['ignore', 'pipe', 'pipe'] })
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url + '/motion'); if (r.ok) return { url, child } } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  child.kill()
  throw new Error('next start did not come up; run `npx next build` in web/ first')
}

// The cursor lives on <html> rather than <body>: the playground viewer makes body's
// children inert, and the cursor has to stay above the viewer.
function cursorInit() {
  if (window.top !== window) return
  try { localStorage.setItem('raven-motion-tour-done', '1') } catch {}
  const add = () => {
    if (document.getElementById('__demo-cursor')) return
    const c = document.createElement('div')
    c.id = '__demo-cursor'
    c.setAttribute('aria-hidden', 'true')
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:30px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);will-change:transform'
    c.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30" style="display:block;transform-origin:2px 2px;transition:transform 90ms ease"><path d="M2 2 L2 23 L7.5 18 L11.5 27 L15 25.5 L11 16.8 L18.5 16.8 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.documentElement.appendChild(c)
  }
  if (document.documentElement) add()
  document.addEventListener('DOMContentLoaded', add)
}

async function main() {
  let server = null
  if (!baseUrl) { server = await startServer(); baseUrl = server.url }
  const frameDir = keepFrames ? resolve(keepFrames) : mkdtempSync(join(tmpdir(), 'motion-demo-'))
  mkdirSync(frameDir, { recursive: true })

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl })
    const page = await context.newPage()
    await page.addInitScript(cursorInit)
    await page.goto(baseUrl + '/motion', { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.locator('[data-motion-find]').waitFor({ state: 'visible' })
    await page.waitForTimeout(1500)

    // Cursor: the real pointer and the drawn one move together. It rests in the empty
    // part of Grab's right panel, where it highlights nothing on the page or in the list.
    const REST = { x: 1400, y: 430 }
    let cx = REST.x, cy = REST.y
    // Grab adds its host (and the viewer) after the cursor, so the cursor moves back to
    // the end of <html> whenever something lands after it, to stay on top.
    const place = (x, y) => page.evaluate(([x, y]) => {
      const c = document.getElementById('__demo-cursor')
      if (!c) return
      if (c.nextElementSibling) document.documentElement.appendChild(c)
      c.style.transform = `translate(${x - 2}px, ${y - 2}px)`
    }, [x, y])
    const press = (down) => page.evaluate((down) => {
      const s = document.querySelector('#__demo-cursor svg')
      if (s) s.style.transform = down ? 'scale(0.86)' : ''
    }, down)
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    async function moveTo(x, y, ms = 700) {
      const x0 = cx, y0 = cy, steps = Math.max(2, Math.round(ms / 16)), t0 = Date.now()
      for (let i = 1; i <= steps; i++) {
        const k = ease(i / steps)
        const nx = x0 + (x - x0) * k, ny = y0 + (y - y0) * k
        await Promise.all([page.mouse.move(nx, ny), place(nx, ny)])
        const wait = t0 + (i * ms) / steps - Date.now()
        if (wait > 0) await page.waitForTimeout(wait)
      }
      cx = x; cy = y
    }
    async function click() {
      await press(true); await page.mouse.down(); await page.waitForTimeout(110)
      await page.mouse.up(); await press(false)
    }
    const centre = async (locator) => {
      const b = await locator.boundingBox()
      if (!b) throw new Error('not on screen: ' + locator)
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b }
    }
    const hold = (ms) => page.waitForTimeout(ms)

    await place(cx, cy)
    await page.mouse.move(cx, cy)
    await hold(300)

    // Screencast: every composited frame, with its timestamp.
    const cdp = await context.newCDPSession(page)
    const frames = []
    const steps = []
    let t0 = null
    const mark = (name) => { steps.push({ name, t: (Date.now() / 1000) - t0 }) }
    cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      frames.push({ data, ts: metadata.timestamp })
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
    t0 = Date.now() / 1000
    // Nudge a repaint so the screencast has a first frame straight away.
    await place(cx, cy + 0.01)

    // 1. The page at rest, Motion tab open.
    mark('rest')
    await hold(1400)

    // 2. Find motion: markers and the list appear.
    const find = await centre(page.locator('[data-motion-find]'))
    await moveTo(find.x, find.y, 800)
    await hold(150)
    mark('find')
    await click()
    await page.locator('.raven-grab-motion-row').first().waitFor({ state: 'visible' })
    await hold(1900)

    // 3. Open suggestion 1, Button hover: Open dashboard.
    const first = await centre(page.locator('[data-motion-play="1"]'))
    await moveTo(first.x - 30, first.y, 700)
    await hold(150)
    mark('open')
    await click()
    const viewer = page.frameLocator('[data-motion-viewer] iframe')
    await viewer.locator('#in-lift').waitFor({ state: 'visible' })
    await hold(1200)

    // 4. Play it: hover the button in the preview.
    const target = await centre(viewer.getByText('Open dashboard', { exact: true }).first())
    await moveTo(target.x + 60, target.y + 120, 650)
    mark('play')
    await moveTo(target.x + 40, target.y + 10, 450)
    await hold(1100)
    await moveTo(target.x + 120, target.y + 150, 450)
    await hold(500)

    // Drags a playground slider from its current value to `to`.
    async function dragSlider(input, to, name) {
      const track = await input.boundingBox()
      const min = Number(await input.getAttribute('min')), max = Number(await input.getAttribute('max'))
      const at = (v) => track.x + 9 + ((v - min) / (max - min)) * (track.width - 18)
      const fromX = at(Number(await input.inputValue())), endX = at(to)
      const ty = track.y + track.height / 2
      await moveTo(fromX, ty, 750)
      await hold(150)
      mark(name)
      await press(true); await page.mouse.down()
      const dragSteps = 50
      for (let i = 1; i <= dragSteps; i++) {
        const nx = fromX + (endX - fromX) * ease(i / dragSteps)
        await Promise.all([page.mouse.move(nx, ty), place(nx, ty)])
        await page.waitForTimeout(20)
      }
      cx = endX; cy = ty
      await page.mouse.up(); await press(false)
    }

    // 5. Drag Lift to its top and play again.
    await dragSlider(viewer.locator('#in-lift'), 8, 'drag')
    await hold(500)
    await moveTo(target.x + 60, target.y + 120, 650)
    mark('replay')
    await moveTo(target.x + 40, target.y + 10, 450)
    await hold(1300)
    await moveTo(target.x + 120, target.y + 150, 450)
    await hold(400)

    // 5b. Next: Hero entrance. It plays on a loop; drag Rise to its top so the
    // headline travels further.
    const next = await centre(page.locator('[data-motion-viewer-next]'))
    await moveTo(next.x, next.y, 800)
    await hold(150)
    mark('hero')
    await click()
    // The next playground loads hidden over the open one and swaps in once it has loaded.
    await page.locator('.raven-grab-motion-viewer-pending').waitFor({ state: 'detached' })
    await viewer.locator('#in-rise').waitFor({ state: 'visible' })
    await moveTo(next.x - 300, next.y + 330, 600)
    await hold(2300)
    await dragSlider(viewer.locator('#in-rise'), 80, 'rise')
    await moveTo(cx + 40, cy + 90, 500)
    await hold(2800)

    // 6. Copy for your agent, showing the copied state.
    const copy = await centre(viewer.locator('#copy-agent'))
    await moveTo(copy.x, copy.y, 750)
    await hold(150)
    mark('copy')
    await click()
    await hold(1600)

    // 7. Close and return to the page; the cursor goes back to where it started.
    const close = await centre(page.locator('[data-motion-viewer-close]'))
    await moveTo(close.x, close.y, 800)
    await hold(150)
    mark('close')
    await click()
    // Straight down at once: Close sits over the right panel's layout buttons, whose
    // tooltips show as soon as the viewer is gone.
    await moveTo(close.x - 40, close.y + 140, 220)
    await page.locator('[data-motion-viewer]').waitFor({ state: 'detached' })
    await moveTo(close.x - 160, close.y + 360, 500)
    await hold(500)
    await moveTo(REST.x, REST.y, 1000)
    await hold(500)
    mark('end')

    await cdp.send('Page.stopScreencast')
    await page.waitForTimeout(100)
    if (frames.length < 50) throw new Error('screencast produced only ' + frames.length + ' frames')

    // Frames to disk with per-frame durations for ffmpeg's concat demuxer.
    const tEnd = t0 + steps[steps.length - 1].t
    const list = []
    frames.forEach((f, i) => {
      const name = `f${String(i).padStart(5, '0')}.jpg`
      writeFileSync(join(frameDir, name), Buffer.from(f.data, 'base64'))
      const next = i + 1 < frames.length ? frames[i + 1].ts : Math.max(tEnd, f.ts + 1 / FPS)
      list.push(`file '${name}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`)
    })
    list.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`)
    writeFileSync(join(frameDir, 'list.txt'), list.join('\n') + '\n')
    const shift = frames[0].ts - t0
    writeFileSync(join(frameDir, 'steps.json'), JSON.stringify(steps.map((s) => ({ ...s, t: +(s.t - shift).toFixed(2) })), null, 2))
    const total = frames[frames.length - 1].ts - frames[0].ts + Math.max(1 / FPS, tEnd - frames[frames.length - 1].ts)

    // Encode, fading the last LOOP_FADE seconds into frame 0 so the loop point matches.
    const first0 = join(frameDir, 'f00000.jpg')
    const encode = (crf, out) => execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', join(frameDir, 'list.txt'),
      '-loop', '1', '-framerate', String(FPS), '-t', String(LOOP_FADE + 0.1), '-i', first0,
      '-filter_complex',
      `[0:v]fps=${FPS},scale=${W}:${H}:in_range=pc:out_range=tv,setsar=1,format=yuv420p,settb=AVTB[a];` +
      `[1:v]fps=${FPS},scale=${W}:${H}:in_range=pc:out_range=tv,setsar=1,format=yuv420p,settb=AVTB[b];` +
      `[a][b]xfade=transition=fade:duration=${LOOP_FADE}:offset=${(total - LOOP_FADE).toFixed(3)},format=yuv420p[v]`,
      '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-r', String(FPS), out,
    ])
    const tmpOut = join(frameDir, 'motion-demo.mp4')
    let crf = 20
    for (;;) {
      encode(crf, tmpOut)
      if (statSync(tmpOut).size <= MAX_BYTES || crf >= 32) break
      crf += 2
    }
    if (statSync(tmpOut).size > MAX_BYTES) throw new Error('video is over 7MB even at crf ' + crf)
    cpSync(tmpOut, OUT_MP4)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', OUT_MP4, '-frames:v', '1', '-vf', 'scale=in_range=tv:out_range=pc,format=yuvj420p', '-q:v', '2', OUT_POSTER])

    const size = statSync(OUT_MP4).size
    console.log(`motion-demo.mp4: ${(total).toFixed(1)}s, ${frames.length} source frames, crf ${crf}, ${(size / 1048576).toFixed(2)}MB`)
    console.log('steps:', steps.map((s) => `${s.name} ${(s.t - shift).toFixed(1)}s`).join(', '))
  } finally {
    await browser.close()
    if (server) server.child.kill()
    if (!keepFrames) rmSync(frameDir, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
