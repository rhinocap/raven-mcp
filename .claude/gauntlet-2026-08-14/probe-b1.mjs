import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { measureGauntletPage } from '../../dist/design-gauntlet.js';

const html = '<!doctype html><title>decoy</title><body>' +
  Array.from({ length: 30 }, (_, i) =>
    '<div style="width:200px;height:60px;opacity:0;background:rgb(' + (i + 1) + ',0,0)"></div>').join('') +
  Array.from({ length: 5 }, () =>
    '<div style="width:200px;height:60px;background:rgb(10,20,30)">visible</div>').join('') +
  '</body>';
const dir = await mkdtemp(join(tmpdir(), 'gauntlet-b1-'));
const file = join(dir, 'page.html');
await writeFile(file, html);
try {
  const t0 = Date.now();
  const m = await measureGauntletPage(pathToFileURL(file).href);
  console.log('elapsed_ms=', Date.now() - t0);
  console.log('visible_elements=', m.visible_elements);
  console.log('warnings=', JSON.stringify(m.warnings));
  console.log('tally_has_decoy=', m.surfaces.tally.some((e) => e.value === '#010000'));
} catch (e) {
  console.log('THREW', e && e.name, e && e.message);
} finally {
  await rm(dir, { recursive: true, force: true });
  process.exit(0);
}
