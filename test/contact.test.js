const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Save submissions to a temporary file, so the tests never touch data/submissions.jsonl.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calico-contact-'));
const submissionsFile = path.join(tempDir, 'submissions.jsonl');
process.env.SUBMISSIONS_FILE = submissionsFile;

const app = require('../server/index');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(submissionsFile, { force: true });
});

const genuine = {
  name: 'Priya Shah',
  email: 'priya@northsidephysio.co.uk',
  message: 'Could we book a demo next week?',
  website: '',
  elapsedMs: 12000,
};

async function submit(body) {
  const response = await fetch(`${baseUrl}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function savedSubmissions() {
  if (!fs.existsSync(submissionsFile)) return [];
  return fs.readFileSync(submissionsFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

test('a genuine submission is saved', async () => {
  const result = await submit(genuine);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });

  const saved = savedSubmissions();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'Priya Shah');
  assert.equal(saved[0].email, 'priya@northsidephysio.co.uk');
  assert.equal(saved[0].message, 'Could we book a demo next week?');
});

test('a genuine submission is saved when sent as a normal form post', async () => {
  const response = await fetch(`${baseUrl}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...genuine, elapsedMs: '12000' }),
  });

  assert.equal(response.status, 200);
  assert.equal(savedSubmissions().length, 1);
});

test('a submission with the honeypot filled in is not saved', async () => {
  const result = await submit({ ...genuine, website: 'https://cheap-seo.example' });

  // The bot is told it worked, so it doesn't learn it was caught.
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(savedSubmissions().length, 0);
});

test('a submission sent within 3 seconds is not saved', async () => {
  const result = await submit({ ...genuine, elapsedMs: 800 });

  assert.deepEqual(result.body, { ok: true });
  assert.equal(savedSubmissions().length, 0);
});

test('a submission sent just under 3 seconds is not saved, and just over is', async () => {
  await submit({ ...genuine, elapsedMs: 2999 });
  assert.equal(savedSubmissions().length, 0);

  await submit({ ...genuine, elapsedMs: 3000 });
  assert.equal(savedSubmissions().length, 1);
});

test('a submission with no timing information is not saved', async () => {
  const { elapsedMs, ...withoutTiming } = genuine;
  const result = await submit(withoutTiming);

  assert.deepEqual(result.body, { ok: true });
  assert.equal(savedSubmissions().length, 0);
});

test('a genuine submission with a missing field is still rejected with an error', async () => {
  const result = await submit({ ...genuine, message: '   ' });

  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.equal(savedSubmissions().length, 0);
});
