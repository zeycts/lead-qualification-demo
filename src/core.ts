import { z } from 'zod';

export class DemoError extends Error {}
export function validateInput(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 10000) {
    throw new DemoError('Input must be nonblank text of at most 10,000 characters.');
  }
  return input;
}

// Quotes, not inferred facts: every populated field must occur verbatim in the input.
const quote = z.string().min(1).max(1000).nullable();
export const extractionSchema = z.object({
  serviceRequest: quote,
  budgetText: quote,
  timelineText: quote,
  authorityText: quote,
}).strict();
export type Extraction = z.infer<typeof extractionSchema>;

export function validateExtraction(value: unknown, input: string): Extraction {
  validateInput(input);
  const parsed = extractionSchema.safeParse(value);
  if (!parsed.success) throw new DemoError('Extraction failed schema validation.');
  for (const text of Object.values(parsed.data)) {
    if (text !== null && !input.includes(text)) {
      throw new DemoError('Extraction contains a quote absent from the input.');
    }
  }
  return parsed.data;
}

export const resultSchema = z.object({
  mode: z.enum(['offline-fixture', 'live']),
  provenance: z.string().min(1),
  extracted: extractionSchema,
  normalized: z.object({
    budgetUsd: z.number().int().nonnegative().nullable(),
    timelineDays: z.number().int().nonnegative().nullable(),
    decisionMaker: z.boolean().nullable(),
  }).strict(),
  score: z.number().int().min(0).max(100),
  priority: z.enum(['high', 'medium', 'low']),
  reasons: z.array(z.object({ rule: z.string(), points: z.number().int(), explanation: z.string() }).strict()).length(4),
  suggestedReply: z.string().min(1),
}).strict();
export type Result = z.infer<typeof resultSchema>;

export function qualify(input: string, extraction: unknown, mode: Result['mode']): Result {
  const extracted = validateExtraction(extraction, input);
  const budgetMatch = extracted.budgetText?.match(/^\$([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?: USD)?$/);
  const timelineMatch = extracted.timelineText?.match(/^within ([0-9]+) days$/i);
  const safeNumber = (raw: string | undefined): number | null => {
    if (raw === undefined) return null;
    const number = Number(raw.replaceAll(',', ''));
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  };
  const budgetUsd = safeNumber(budgetMatch?.[1]);
  const timelineDays = safeNumber(timelineMatch?.[1]);
  // Narrow positive statements only: do not infer an approver from negated/ambiguous text.
  const managerApproves = ['My manager approves the budget', 'my manager approves the budget',
    'I cannot approve the budget; my manager decides'].includes(extracted.authorityText ?? '');
  const decisionMaker = extracted.authorityText === 'I approve the budget' ? true
    : ['I cannot approve the budget', 'I cannot approve the budget; my manager decides'].includes(extracted.authorityText ?? '') ? false : null;
  const fit = /\bautomation\b/i.test(extracted.serviceRequest ?? '');
  const reasons = [
    { rule: 'service-fit', points: fit ? 30 : 0, explanation: fit ? 'Request explicitly mentions automation.' : 'Automation fit not established.' },
    { rule: 'budget', points: budgetUsd === null ? 0 : budgetUsd >= 3000 ? 30 : budgetUsd >= 1000 ? 15 : 0,
      explanation: budgetUsd === null ? 'USD budget unknown or unsupported format.' : `Explicit USD budget: ${budgetUsd}; >=3000 earns 30, >=1000 earns 15.` },
    { rule: 'timeline', points: timelineDays !== null && timelineDays >= 7 && timelineDays <= 30 ? 20 : 0,
      explanation: timelineDays === null ? 'Timeline unknown or unsupported format.' : `Explicit timeline: ${timelineDays} days; 7–30 earns 20.` },
    { rule: 'authority', points: decisionMaker === true ? 20 : 0,
      explanation: decisionMaker === true ? 'Explicit budget approval authority.' : managerApproves ? decisionMaker === false ? 'Manager approval stated; lead cannot approve budget.' : 'Manager approval stated; lead approval authority not established.' : decisionMaker === false ? 'Explicitly cannot approve budget.' : 'Approval authority unknown.' },
  ];
  const score = reasons.reduce((sum, reason) => sum + reason.points, 0);
  const priority = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  const questions: string[] = [];
  if (!fit) questions.push('Is workflow automation part of your request?');
  if (budgetUsd === null) questions.push('What is your budget in USD?');
  if (timelineDays === null) questions.push('Do you have a target launch date in mind?');
  if (decisionMaker !== true && !managerApproves) questions.push('Who approves the budget?');
  const clearWebsiteMismatch = !fit && /^(?:a )?brochure website$/i.test(extracted.serviceRequest ?? '');
  const suggestedReply = clearWebsiteMismatch
    ? 'Thanks for reaching out. My focus is workflow automation, not brochure website design.'
    : `Thanks for reaching out. ${questions.length ? questions.join(' ') : 'Could you share your current workflow and desired outcome here in Upwork messages so we can confirm the scope?'}`;
  return resultSchema.parse({
    mode,
    provenance: mode === 'offline-fixture' ? 'Precomputed illustrative extraction fixture; no inference or network call.' : 'Live provider extraction; verbatim quotes validated, not independently verified.',
    extracted, normalized: { budgetUsd, timelineDays, decisionMaker }, score, priority, reasons, suggestedReply,
  });
}
