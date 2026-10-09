import { DemoError } from './core.js';
import { qualify } from './core.js';
import { fixtures } from './fixtures.js';
import { qualifyLive } from './provider.js';

async function readStdin(): Promise<string> {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 10000) throw new DemoError('Input must be nonblank text of at most 10,000 characters.');
  }
  return input;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'demo' && (args.length === 0 || (args.length === 1 && args[0] === '--json'))) {
    const examples = fixtures.map(({ id, input, extraction }) => ({ id, input, output: qualify(input, extraction, 'offline-fixture') }));
    if (args[0] === '--json') console.log(JSON.stringify(examples, null, 2));
    else {
      console.log('PERSONAL PORTFOLIO DEMO — synthetic leads only');
      console.log('OFFLINE: precomputed illustrative extraction fixtures, NOT real inference. No network or keys.');
      console.log('Illustrative client-unconfirmed rules: fit 30 + budget 30 + timeline 20 + authority 20.');
      for (const example of examples) {
        console.log(`\n=== ${example.id} | ${example.output.priority.toUpperCase()} ${example.output.score}/100 ===`);
        console.log(`INPUT: ${example.input}`);
        console.log(`OUTPUT:\n${JSON.stringify(example.output, null, 2)}`);
      }
    }
  } else if (command === 'showcase' && args.length === 0) {
    console.log('LEAD TRIAGE | OFFLINE / SYNTHETIC / PRECOMPUTED EXTRACTION');
    console.log('Not inference. Illustrative rules; replies are drafts for human review.');
    console.log('Rules: automation +30; budget >=$3000 +30 / >=$1000 +15; 7-30 days +20; budget approver +20.');
    for (const { input, extraction } of fixtures) {
      const result = qualify(input, extraction, 'offline-fixture');
      console.log(`\n${result.priority.toUpperCase()} ${result.score}/100 | ${result.extracted.serviceRequest ?? 'Service unknown'}`);
      console.log(`Lead: ${input}`);
      const { budgetUsd, timelineDays, decisionMaker } = result.normalized;
      console.log(`Facts: budget ${budgetUsd === null ? 'unknown' : `$${budgetUsd} USD`} | timeline ${timelineDays === null ? 'unknown' : `${timelineDays} days`} | approver ${decisionMaker === null ? 'unknown' : decisionMaker ? 'yes' : 'no'}`);
      console.log(`Points: ${result.reasons.map(reason => `${reason.rule} +${reason.points}`).join(' | ')}`);
      console.log(`Reply: ${result.suggestedReply}`);
    }
    console.log('\nQuality checks: pnpm typecheck && pnpm test (offline mocks; real-run evidence is separate).');
  } else if (command === 'live' && args.length === 0) {
    // Fail before waiting for stdin when no key is configured.
    if (!process.env.GEMINI_API_KEY?.trim()) throw new DemoError('Live mode requires GEMINI_API_KEY; no request sent.');
    const output = await qualifyLive(await readStdin(), { apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL });
    console.log(JSON.stringify(output, null, 2));
  } else {
    throw new DemoError('Usage: pnpm demo [--json] | pnpm showcase | pnpm live < synthetic-lead.txt');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof DemoError ? error.message : 'Demo failed; details suppressed.');
  process.exitCode = 1;
});
