import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { measureGauntletPage } from '../../dist/design-gauntlet.js';

const dir = await mkdtemp(join(tmpdir(), 'gauntlet-probe-m-'));
const file = join(dir, 'page.html');
await writeFile(file, '<!doctype html><title>t</title><body>' +
  Array.from({ length: 25 }, (_, i) => '<div style="width:200px;height:60px;background:rgb(' + (i + 1) + ',0,0)">x</div>').join('') +
  '</body>');
try {
  const m = await measureGauntletPage(pathToFileURL(file).href);
  console.log('OK visible_elements=', m.visible_elements, 'warnings=', JSON.stringify(m.warnings));
} catch (e) {
  console.log('THREW name=', e && e.name, 'message=', e && e.message);
  if (e && e.stack) console.log(e.stack.split('\n').slice(0, 6).join('\n'));
} finally {
  await rm(dir, { recursive: true, force: true });
  process.exit(0);
}
