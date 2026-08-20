import http from 'node:http';
const srv = http.createServer((req, res) => {
  const before = req.rawHeaders.slice();
  // in-place mutation attempt
  let idx = -1;
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (String(req.rawHeaders[i]).toLowerCase() === 'accept') { idx = i; break; }
  }
  let inPlaceOk = false, setterOk = false, setterErr = null;
  if (idx !== -1) { req.rawHeaders[idx + 1] = 'MUTATED-INPLACE'; inPlaceOk = req.rawHeaders[idx + 1] === 'MUTATED-INPLACE'; }
  try { req.rawHeaders = ['accept', 'MUTATED-SETTER']; setterOk = req.rawHeaders[1] === 'MUTATED-SETTER'; }
  catch (e) { setterErr = e.message; }
  res.end(JSON.stringify({ before, idx, inPlaceOk, setterOk, setterErr, after: req.rawHeaders, node: process.version }, null, 1));
});
srv.listen(0, '127.0.0.1', async () => {
  const p = srv.address().port;
  const r = await fetch(`http://127.0.0.1:${p}/`, { method: 'POST', headers: { accept: 'application/json' }, body: '{}' });
  console.log(await r.text());
  srv.close();
});
