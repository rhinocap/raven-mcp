import { buildServer } from '../../dist/index.js';
const s = buildServer({ remote: true });
const t = s._registeredTools['audit_url'];
const signal = new AbortController().signal;
for (const ev of ['click', 'hover']) {
  const p = t.inputSchema.safeParse({ url: 'http://127.0.0.1:9/nothing', interactions: [{ selector: '#a', event: ev, delay_ms: 0 }] });
  const r = await t.handler(p.data, { signal });
  console.log('---', ev, 'isError=' + r.isError, 'n=' + r.content.length);
  r.content.forEach((c, i) => console.log('   [' + i + ']', String(c.text).slice(0, 120)));
}
