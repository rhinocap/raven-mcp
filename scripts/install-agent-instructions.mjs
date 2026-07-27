import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BEGIN = '<!-- BEGIN raven design-decisions (managed by raven; edits here are overwritten) -->';
const END = '<!-- END raven design-decisions -->';

const target = resolve(process.cwd(), process.argv[2] || 'AGENTS.md');
const block = readFileSync(new URL('./consult-first-block.md', import.meta.url), 'utf8');
const managed = `${BEGIN}\n${block}${block.endsWith('\n') ? '' : '\n'}${END}`;

function replaceManagedBlocks(source) {
  let output = '';
  let cursor = 0;
  let replaced = false;

  while (true) {
    const beginIndex = source.indexOf(BEGIN, cursor);
    if (beginIndex === -1) break;

    const endIndex = source.indexOf(END, beginIndex + BEGIN.length);
    if (endIndex === -1) break;

    output += source.slice(cursor, beginIndex);
    if (!replaced) output += managed;
    cursor = endIndex + END.length;
    replaced = true;
  }

  if (!replaced) return null;
  return output + source.slice(cursor);
}

let action;
let output;

if (!existsSync(target)) {
  action = 'created';
  output = `${managed}\n`;
} else {
  const existing = readFileSync(target, 'utf8');
  const updated = replaceManagedBlocks(existing);

  if (updated === null) {
    action = 'appended';
    const separator = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
    output = `${existing}${separator}${managed}\n`;
  } else {
    action = 'updated';
    output = updated;
  }
}

writeFileSync(target, output);
process.stdout.write(`${JSON.stringify({ file: target, action })}\n`);
