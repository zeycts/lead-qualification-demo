import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualify } from '../src/core.js';
import { fixtures } from '../src/fixtures.js';

const empty = { serviceRequest: null, budgetText: null, timelineText: null, authorityText: null };

test('high lead asks for scope in Upwork text messages, not a call', () => {
  const f = fixtures[0]!;
  const result = qualify(f.input, f.extraction, 'offline-fixture');
  assert.equal(result.score, 100);
  assert.match(result.suggestedReply, /Upwork messages/);
  assert.doesNotMatch(result.suggestedReply, /call|meeting|Who approves/);
});

test('medium fixture uses the full grounded manager quote and asks only about missing timing', () => {
  const f = fixtures[1]!;
  const result = qualify(f.input, f.extraction, 'offline-fixture');
  assert.equal(result.extracted.authorityText, 'I cannot approve the budget; my manager decides');
  assert.equal(result.normalized.decisionMaker, false);
  assert.equal(result.score, 45);
  assert.equal(result.suggestedReply, 'Thanks for reaching out. Do you have a target launch date in mind?');
});

test('actual smoke-style manager approval statement prevents redundant approver question', () => {
  const input = 'invoice follow-up automation $1,500 USD My manager approves the budget';
  const result = qualify(input, { serviceRequest: 'invoice follow-up automation', budgetText: '$1,500 USD',
    timelineText: null, authorityText: 'My manager approves the budget' }, 'live');
  // Naming a manager does not prove the requester lacks co-approval authority.
  assert.equal(result.normalized.decisionMaker, null);
  assert.equal(result.normalized.timelineDays, null);
  assert.equal(result.score, 45);
  assert.doesNotMatch(result.suggestedReply, /Who approves/);
  assert.match(result.suggestedReply, /target launch date/);
});

test('not being approver alone does not invent a manager', () => {
  const result = qualify('I cannot approve the budget', { ...empty, authorityText: 'I cannot approve the budget' }, 'offline-fixture');
  assert.equal(result.normalized.decisionMaker, false);
  assert.match(result.suggestedReply, /Who approves the budget/);
  assert.doesNotMatch(result.suggestedReply, /manager/);
});

test('negated and ambiguous manager statements remain unknown', () => {
  for (const authorityText of ['My manager does not approve the budget', 'Maybe my manager approves the budget', 'My manager approves the budget?']) {
    const result = qualify(authorityText, { ...empty, authorityText }, 'offline-fixture');
    assert.equal(result.normalized.decisionMaker, null);
    assert.match(result.suggestedReply, /Who approves/);
  }
});

test('explicit brochure website mismatch gets clear scope response, no irrelevant questions', () => {
  const f = fixtures[2]!;
  const result = qualify(f.input, f.extraction, 'offline-fixture');
  assert.equal(result.score, 0);
  assert.equal(result.suggestedReply, 'Thanks for reaching out. My focus is workflow automation, not brochure website design.');
  assert.doesNotMatch(result.suggestedReply, /\?|call|referral/);
});

test('unknown service is clarified rather than invented as a mismatch', () => {
  const result = qualify('Can you help?', empty, 'offline-fixture');
  assert.match(result.suggestedReply, /Is workflow automation part of your request/);
  assert.doesNotMatch(result.suggestedReply, /brochure website/);
});

test('manager facts outside extracted evidence do not silently suppress questions', () => {
  const result = qualify('My manager approves the budget', empty, 'offline-fixture');
  assert.match(result.suggestedReply, /Who approves/);
  assert.equal(result.normalized.decisionMaker, null);
});
