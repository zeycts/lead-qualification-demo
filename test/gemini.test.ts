import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualifyLive } from '../src/provider.js';

const empty = { serviceRequest: null, budgetText: null, timelineText: null, authorityText: null };
function response(envelope: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(envelope), { status })) as typeof fetch;
}
function candidate(parts: unknown[], finishReason = 'STOP') {
  return { candidates: [{ finishReason, content: { parts } }] };
}

test('default Gemini model and nulls work with split text and ignored thought parts', async () => {
  const json = JSON.stringify(empty);
  const stub: typeof fetch = async (url) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    return new Response(JSON.stringify(candidate([
      { thought: true, text: 'not an extraction' }, { text: json.slice(0, 20) }, { text: json.slice(20) },
    ])));
  };
  const result = await qualifyLive('Hello', { apiKey: 'fake', fetchImpl: stub });
  assert.deepEqual(result.extracted, empty);
  assert.equal(result.score, 0);
});

for (const [label, stub] of [
  ['extra extraction field', response(candidate([{ text: JSON.stringify({ ...empty, extra: true }) }]))],
  ['empty text', response(candidate([{ text: '' }]))],
  ['HTTP auth failure', response({ error: { message: 'secret-key' } }, 403)],
  ['HTTP server failure', response({ error: { message: 'private' } }, 500)],
  ['provider error envelope', response({ error: { message: 'private' }, ...candidate([{ text: JSON.stringify(empty) }]) })],
  ['prompt safety block', response({ promptFeedback: { blockReason: 'SAFETY' }, ...candidate([{ text: JSON.stringify(empty) }]) })],
  ['safety candidate', response(candidate([{ text: JSON.stringify(empty) }], 'SAFETY'))],
  ['truncated candidate', response(candidate([{ text: JSON.stringify(empty) }], 'MAX_TOKENS'))],
  ['empty candidates', response({ candidates: [] })],
  ['missing candidates', response({})],
  ['malformed candidates', response({ candidates: 'private' })],
  ['empty parts', response(candidate([]))],
  ['nontext part', response(candidate([{ functionCall: {} }]))],
  ['missing content', response({ candidates: [{ finishReason: 'STOP' }] })],
  ['thought-only response', response(candidate([{ thought: true, text: 'private' }]))],
] as const) {
  test(`Gemini handles ${label} without leaking raw data`, async () => {
    await assert.rejects(qualifyLive('Hello', { apiKey: 'fake', fetchImpl: stub }), (error: Error) => {
      assert.doesNotMatch(error.message, /private|secret-key|fake|Hello/);
      return true;
    });
  });
}
