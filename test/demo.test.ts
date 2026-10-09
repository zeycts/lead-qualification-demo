import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extractionSchema, qualify, resultSchema, validateExtraction, validateInput, type Result } from '../src/core.js';
import { fixtures } from '../src/fixtures.js';
import { qualifyLive } from '../src/provider.js';

const empty = { serviceRequest: null, budgetText: null, timelineText: null, authorityText: null };
for (const fixture of fixtures) {
  test(`fixture: ${fixture.id} is grounded and matches documented outcome`, () => {
    const result = qualify(fixture.input, fixture.extraction, 'offline-fixture');
    assert.equal(result.score, fixture.expectedScore);
    assert.equal(result.priority, fixture.expectedPriority);
    assert.equal(result.reasons.reduce((sum, r) => sum + r.points, 0), result.score);
    assert.match(result.provenance, /Precomputed/);
    assert.equal(resultSchema.safeParse(result).success, true);
    assert.deepEqual(qualify(fixture.input, fixture.extraction, 'offline-fixture'), result);
  });
}

test('missing values stay explicit, with clarifying reply and no invented budget', () => {
  const result = qualify('Hello, can we talk?', empty, 'offline-fixture');
  assert.equal(result.score, 0);
  assert.deepEqual(result.normalized, { budgetUsd: null, timelineDays: null, decisionMaker: null });
  assert.match(result.suggestedReply, /budget in USD/);
});

for (const [budget, points] of [[999, 0], [1000, 15], [2999, 15], [3000, 30]] as const) {
  test(`budget boundary ${budget}`, () => {
    const text = `$${budget} USD`;
    assert.equal(qualify(text, { ...empty, budgetText: text }, 'offline-fixture').score, points);
  });
}
for (const [days, points] of [[6, 0], [7, 20], [30, 20], [31, 0]] as const) {
  test(`timeline boundary ${days}`, () => {
    const text = `within ${days} days`;
    assert.equal(qualify(text, { ...empty, timelineText: text }, 'offline-fixture').score, points);
  });
}
for (const [input, extraction, score, priority] of [
  ['automation $1000 USD', { ...empty, serviceRequest: 'automation', budgetText: '$1000 USD' }, 45, 'medium'],
  ['automation within 7 days I approve the budget', { ...empty, serviceRequest: 'automation', timelineText: 'within 7 days', authorityText: 'I approve the budget' }, 70, 'high'],
] as const) {
  test(`priority ${priority}`, () => {
    const result = qualify(input, extraction, 'offline-fixture');
    assert.equal(result.score, score);
    assert.equal(result.priority, priority);
  });
}

test('unsupported formats and currencies do not imply numeric values', () => {
  const result = qualify('€5000 next week probably me', { ...empty, budgetText: '€5000', timelineText: 'next week', authorityText: 'probably me' }, 'offline-fixture');
  assert.deepEqual(result.normalized, { budgetUsd: null, timelineDays: null, decisionMaker: null });
  assert.equal(result.score, 0);
});

test('unsafe numbers remain unknown', () => {
  const text = '$999999999999999999999';
  assert.equal(qualify(text, { ...empty, budgetText: text }, 'offline-fixture').normalized.budgetUsd, null);
});

test('input validation rejects blank, nonstring, oversized input', () => {
  for (const value of ['', ' \n ', null, 42, 'a'.repeat(10001)]) assert.throws(() => validateInput(value));
  assert.equal(validateInput('a'.repeat(10000)).length, 10000);
});

test('strict extraction rejects missing, extra, wrong-type and fabricated fields', () => {
  for (const value of [{}, { ...empty, extra: 1 }, { ...empty, budgetText: 42 }, { ...empty, budgetText: '' }]) {
    assert.equal(extractionSchema.safeParse(value).success, false);
  }
  assert.throws(() => validateExtraction({ ...empty, budgetText: '$5000' }, 'Unknown budget'), /absent/);
});

test('structured result rejects malformed output', () => {
  const fixture = fixtures[0]!;
  const result = qualify(fixture.input, fixture.extraction, 'offline-fixture');
  for (const changed of [{ score: 101 }, { priority: 'urgent' }, { extra: true }, { normalized: {} }, { reasons: [] }]) {
    assert.equal(resultSchema.safeParse({ ...result, ...changed }).success, false);
  }
});

test('copyable JSON artifact stays tied to fixture inputs and computed outputs', () => {
  const artifact = JSON.parse(readFileSync(new URL('../examples/offline-output.json', import.meta.url), 'utf8'));
  assert.deepEqual(artifact, fixtures.map(({ id, input, extraction }) => ({ id, input, output: qualify(input, extraction, 'offline-fixture') })));
});

function runCli(args: string[], input = '', key = '', extraEnv: Record<string, string> = {}) {
  const cli = new URL('../src/cli.ts', import.meta.url).href;
  const script = `globalThis.fetch = () => { throw new Error('NETWORK FORBIDDEN'); }; process.argv = ['node', 'cli', ...${JSON.stringify(args)}]; await import(${JSON.stringify(cli)});`;
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    input, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: key, GEMINI_MODEL: 'gemini-3.5-flash-lite', ...extraEnv }, timeout: 10000,
  });
}

test('CLI demo works without network even with a key set', () => {
  const processResult = runCli(['demo', '--json'], '', 'test-only-key');
  assert.equal(processResult.status, 0, processResult.stderr);
  const examples = JSON.parse(processResult.stdout);
  assert.deepEqual(examples.map((example: { output: Result }) => example.output.score), [100, 45, 0]);
  assert.ok(examples.every((example: { output: Result }) => example.output.mode === 'offline-fixture'));
});

test('CLI errors are nonzero, bounded and contain no submitted input', () => {
  for (const [args, input, key, pattern] of [
    [['live'], 'private lead text', '', /requires GEMINI_API_KEY/],
    [['live'], ' \n ', 'test-only-key', /nonblank/],
    [['live'], 'x'.repeat(10001), 'test-only-key', /10,000/],
    [['unknown'], 'private lead text', '', /Usage:/],
  ] as const) {
    const result = runCli([...args], input, key);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, pattern);
    assert.doesNotMatch(result.stderr, /private lead text|test-only-key|NETWORK FORBIDDEN/);
    assert.equal(result.stdout, '');
  }
});

test('showcase uses computed fixture facts, scores, points and replies without network', () => {
  const result = runCli(['showcase'], '', 'test-only-key');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OFFLINE \/ SYNTHETIC \/ PRECOMPUTED EXTRACTION/);
  assert.doesNotMatch(result.stdout, /"extracted"/);
  for (const fixture of fixtures) {
    const output = qualify(fixture.input, fixture.extraction, 'offline-fixture');
    assert.ok(result.stdout.includes(fixture.input));
    assert.ok(result.stdout.includes(`${output.priority.toUpperCase()} ${output.score}/100`));
    assert.ok(result.stdout.includes(output.suggestedReply));
    for (const reason of output.reasons) assert.ok(result.stdout.includes(`${reason.rule} +${reason.points}`));
  }
  assert.match(result.stdout, /timeline unknown/);
});

test('CLI does not use legacy credentials or accept non-Gemini provider/model flags', () => {
  // Legacy names intentionally confined to this regression test.
  const missing = runCli(['live'], '', '', { OPENAI_API_KEY: 'legacy-test-key', OPENAI_MODEL: 'legacy-model' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /requires GEMINI_API_KEY/);
  for (const args of [['live', '--provider', 'other'], ['live', '--model', 'other'], ['showcase', '--live']]) {
    const result = runCli(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
  }
});

function mockResponse(content: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: content }] } }] }), { status })) as typeof fetch;
}

test('stubbed live provider verifies URL, auth, model, prompt, JSON mode and grounded output', async () => {
  const fixture = fixtures[0]!;
  let calls = 0;
  const stub: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(init?.headers, { 'x-goog-api-key': 'test-only-key', 'Content-Type': 'application/json' });
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body).sort(), ['contents', 'generationConfig', 'systemInstruction']);
    assert.deepEqual(body.generationConfig, { responseMimeType: 'application/json', responseSchema: {
      type: 'OBJECT', properties: {
        serviceRequest: { type: 'STRING', nullable: true }, budgetText: { type: 'STRING', nullable: true },
        timelineText: { type: 'STRING', nullable: true }, authorityText: { type: 'STRING', nullable: true },
      }, required: ['serviceRequest', 'budgetText', 'timelineText', 'authorityText'],
    } });
    assert.match(body.systemInstruction.parts[0].text, /untrusted data/);
    assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: fixture.input }] }]);
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(fixture.extraction) }] } }] }));
  };
  const result = await qualifyLive(fixture.input, { apiKey: 'test-only-key', model: 'gemini-test-model', fetchImpl: stub });
  assert.equal(calls, 1);
  assert.equal(result.mode, 'live');
  assert.equal(result.score, 100);
});

test('no provider call for missing key, invalid input or invalid model', async () => {
  const never: typeof fetch = async () => { assert.fail('Network must not be called'); };
  await assert.rejects(qualifyLive('Hello', { fetchImpl: never }), /requires GEMINI_API_KEY/);
  await assert.rejects(qualifyLive(' ', { apiKey: 'fake', fetchImpl: never }), /nonblank/);
  for (const model of ['', ' ', 'other-model', 'models/gemini-test', 'gemini-test?key=secret', 'gemini-test/path', 'gemini-test:generateContent', 'https://evil.test', 'gemini-test#fragment', 'gemini-test%2Fpath', 'gemini-' + 'x'.repeat(101)]) {
    await assert.rejects(qualifyLive('Hello', { apiKey: 'fake', model, fetchImpl: never }), /Invalid GEMINI_MODEL/);
  }
});

for (const [label, stub] of [
  ['invalid JSON', mockResponse('not json')],
  ['invalid schema', mockResponse('{}')],
  ['fabricated value', mockResponse(JSON.stringify({ ...empty, budgetText: '$9000' }))],
  ['missing content', mockResponse(null)],
  ['provider HTTP failure', mockResponse('private provider details', 429)],
  ['invalid envelope', (async () => new Response('null')) as typeof fetch],
  ['invalid response body', (async () => new Response('not JSON')) as typeof fetch],
  ['network failure', (async () => { throw new Error('secret-key and private lead'); }) as typeof fetch],
  ['timeout', (async () => { throw new DOMException('private details', 'TimeoutError'); }) as typeof fetch],
] as const) {
  test(`live handles ${label} without leaking raw data`, async () => {
    await assert.rejects(qualifyLive('Hello', { apiKey: 'fake', fetchImpl: stub }), (error: Error) => {
      assert.doesNotMatch(error.message, /private|secret-key|fake|Hello|9000/);
      return true;
    });
  });
}
