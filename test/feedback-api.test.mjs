import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFeedbackHandler } from '../api/feedback.js';

function request(body, overrides = {}) {
  return {
    method: overrides.method || 'POST',
    headers: overrides.headers || {},
    socket: { remoteAddress: overrides.ip || '127.0.0.1' },
    body
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    end() {
      return this;
    }
  };
}

function validBody(overrides = {}) {
  return {
    message: 'The layer inspector is useful.',
    page: 'https://example.com/pricing',
    viewport: '1440x900',
    ravenVersion: '1.17.0',
    ...overrides
  };
}

function githubResponse(url = 'https://github.com/owner/name/issues/1') {
  return {
    ok: true,
    status: 201,
    async json() {
      return { html_url: url };
    }
  };
}

test('feedback endpoint rejects non-POST methods', async () => {
  const handler = createFeedbackHandler({ env: {}, log() {} });
  const res = response();

  await handler(request(undefined, { method: 'GET' }), res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST, OPTIONS');
});

test('feedback endpoint rejects a blank message', async () => {
  const handler = createFeedbackHandler({ env: {}, log() {} });
  const res = response();

  await handler(request(validBody({ message: ' \n\t ' })), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { error: 'Message is required' });
});

test('feedback endpoint rejects a message over 5000 characters', async () => {
  const handler = createFeedbackHandler({ env: {}, log() {} });
  const res = response();

  await handler(request(validBody({ message: 'x'.repeat(5001) })), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /5000/);
});

test('feedback endpoint rejects a parsed body over 100KB', async () => {
  const handler = createFeedbackHandler({ env: {}, log() {} });
  const res = response();

  await handler(request(validBody({ page: 'x'.repeat(100001) })), res);

  assert.equal(res.statusCode, 413);
  assert.match(res.payload.error, /100KB/);
});

test('feedback endpoint treats missing GitHub configuration as a soft success', async () => {
  const logs = [];
  const handler = createFeedbackHandler({ env: {}, log(entry) { logs.push(entry); } });
  const res = response();

  await handler(request(validBody()), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, delivered: false, reason: 'not configured' });
  // With delivery off the log is the only copy, so the message must be in it --
  // otherwise a config gap the user cannot see silently eats their report.
  assert.equal(logs.length, 2);
  assert.match(logs[1], /"undelivered":true/);
  assert.match(logs[1], /The layer inspector is useful\./);
  // The always-on trace stays content-free.
  assert.ok(!logs[0].includes('The layer inspector is useful.'));
});

test('feedback endpoint neutralises GitHub mentions and fences the message', async () => {
  let outbound;
  const handler = createFeedbackHandler({
    env: { RAVEN_FEEDBACK_GITHUB_TOKEN: 'secret', RAVEN_FEEDBACK_REPO: 'owner/name' },
    log() {},
    fetch: async function (url, init) {
      outbound = { url, init };
      return githubResponse();
    }
  });
  const res = response();

  await handler(request(validBody({ message: 'Please ask @octocat about ``` rendering.' })), res);

  const issue = JSON.parse(outbound.init.body);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, delivered: true, url: 'https://github.com/owner/name/issues/1' });
  assert.ok(!issue.body.includes('@octocat'));
  assert.match(issue.body, /@\u200boctocat/);
  assert.match(issue.body, /^````text\n/);
  assert.deepEqual(issue.labels, ['feedback']);
});

test('feedback endpoint routes the submitter email to the private issue, not the platform logs', async () => {
  const logs = [];
  let issue;
  const email = 'private-person@example.com';
  const handler = createFeedbackHandler({
    env: { RAVEN_FEEDBACK_GITHUB_TOKEN: 'secret', RAVEN_FEEDBACK_REPO: 'owner/name' },
    log(entry) { logs.push(entry); },
    fetch: async function (_url, init) {
      issue = JSON.parse(init.body);
      return githubResponse();
    }
  });
  const res = response();

  await handler(request(validBody({ email, projectName: 'Private project' })), res);

  assert.equal(res.statusCode, 200);
  // The form promises "so we can reply", so the address has to reach whoever triages
  // the issue. The target repo is private -- that is why it is private.
  assert.ok(issue.body.includes(email), 'the reply address reaches the issue');
  assert.ok(!issue.title.includes(email), 'but never the title');
  // Logs carry an operational trace only. Duplicating the message and the address
  // into platform logs makes a second copy under a retention policy nobody chose.
  assert.ok(!logs[0].includes(email), 'the address is not written to platform logs');
  assert.ok(!logs[0].includes('Private project'), 'nor is the project name');
  assert.match(logs[0], /"hasEmail":true/);
});

test('feedback endpoint does not lose a report when the repo name is malformed', async () => {
  const logs = [];
  const handler = createFeedbackHandler({
    env: { RAVEN_FEEDBACK_GITHUB_TOKEN: 'secret', RAVEN_FEEDBACK_REPO: 'not-an-owner-slash-name' },
    log(entry) { logs.push(entry); },
    fetch: async function () { throw new Error('must not reach GitHub with a malformed repo'); }
  });
  const res = response();

  await handler(request(validBody()), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, delivered: false, reason: 'not configured' });
  // This branch used to answer "thanks" and drop the report on the floor -- the same
  // invisible config gap as a missing token, so it gets the same undelivered copy.
  assert.ok(logs.some((entry) => entry.includes('"undelivered":true')));
  assert.ok(logs.some((entry) => entry.includes('The layer inspector is useful.')));
});

test('feedback endpoint rate-limits the sender, and editing the message does not reset the count', async () => {
  let currentTime = Date.parse('2026-07-19T20:00:00.000Z');
  const handler = createFeedbackHandler({
    env: {},
    log() {},
    now() { return currentTime; }
  });

  // Five distinct messages inside the window are fine -- someone filing related
  // reports in a row is a real user, not an abuser.
  for (let i = 0; i < 5; i += 1) {
    const ok = response();
    await handler(request(validBody({ message: 'Report number ' + i })), ok);
    assert.equal(ok.statusCode, 200, 'message ' + i + ' is accepted');
    currentTime += 1_000;
  }

  // The sixth is refused. Keying this guard on message equality (as it once was)
  // meant one changed character bought unlimited issue creation.
  const refused = response();
  await handler(request(validBody({ message: 'A sixth, differently worded report' })), refused);
  assert.equal(refused.statusCode, 429);

  // Once the window has passed, the same sender is served again.
  currentTime += 61_000;
  const later = response();
  await handler(request(validBody({ message: 'A report after the window' })), later);
  assert.equal(later.statusCode, 200);
});
