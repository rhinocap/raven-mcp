// The prebuilt Motion bundle is swapped in whole: the old one or the new one, never half of each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publish } from '../scripts/build-motion-playground.mjs';

test('publish replaces the bundle as a whole and leaves no staging or backup behind', () => {
  const parent = mkdtempSync(path.join(tmpdir(), 'motion-publish-'));
  const dir = path.join(parent, 'motion');
  mkdirSync(dir);
  writeFileSync(path.join(dir, 'old-1.html'), 'old');
  writeFileSync(path.join(dir, 'suggestions.json'), '{"old":true}');
  publish(new Map([['new-1.html', 'new'], ['suggestions.json', '{"new":true}']]), dir);
  assert.deepEqual(readdirSync(dir).sort(), ['new-1.html', 'suggestions.json']);
  assert.equal(readFileSync(path.join(dir, 'suggestions.json'), 'utf8'), '{"new":true}');
  assert.deepEqual(readdirSync(parent), ['motion']);
});

test('publish creates the bundle when none exists yet', () => {
  const parent = mkdtempSync(path.join(tmpdir(), 'motion-publish-'));
  const dir = path.join(parent, 'motion');
  publish(new Map([['a.html', 'a']]), dir);
  assert.ok(existsSync(path.join(dir, 'a.html')));
  assert.deepEqual(readdirSync(parent), ['motion']);
});
