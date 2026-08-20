// Boots the REAL api/mcp.js default export behind a node server and POSTs a
// valid tools/list with a narrow Accept. 406 = normalization inert, 200 = fixed.
import http from 'node:http';
import handler from '../../api/mcp.js';

const srv = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  req.body = body ? JSON.parse(body) : undefined;
  // minimal express-ish shims api/mcp.js uses
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  try { await handler(req, res); } catch (e) { if (!res.headersSent) { res.statusCode = 500; res.end(String(e)); } }
});

const RPC = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

srv.listen(0, '127.0.0.1', async () => {
  const p = srv.address().port;
  let bad = 0;
  for (const [label, accept] of [
    ['narrow  (application/json only)', 'application/json'],
    ['star    (*/*)', '*/*'],
    ['correct (both types)', 'application/json, text/event-stream']
  ]) {
    const r = await fetch(`http://127.0.0.1:${p}/api/mcp`, {
      method: 'POST',
      headers: { accept, 'content-type': 'application/json' },
      body: JSON.stringify(RPC)
    });
    const text = await r.text();
    let n = null;
    try { n = (JSON.parse(text.replace(/^event:.*\ndata: /m, '')).result || {}).tools?.length ?? null; } catch {}
    const ok = r.status === 200 && n !== null;
    if (!ok) bad += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  -> HTTP ${r.status}  tools=${n}`);
    if (!ok) console.log('      body: ' + text.slice(0, 200));
  }
  srv.close();
  console.log(bad === 0 ? 'ALL CHECKS PASSED' : `${bad} FAILED`);
  process.exitCode = bad === 0 ? 0 : 1;
});
