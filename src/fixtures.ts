import type { Extraction } from './core.js';

// Manually authored synthetic inputs and matching precomputed extractions, NOT inference.
export const fixtures: { id: string; input: string; extraction: Extraction; expectedScore: number; expectedPriority: string }[] = [
  {
    id: 'ready-automation-buyer',
    input: 'Hi, I need lead routing automation for a small consulting team. Our budget is $5,000 USD and we want a pilot within 21 days. I approve the budget.',
    extraction: { serviceRequest: 'lead routing automation', budgetText: '$5,000 USD', timelineText: 'within 21 days', authorityText: 'I approve the budget' },
    expectedScore: 100, expectedPriority: 'high',
  },
  {
    id: 'early-automation-research',
    input: 'We are exploring invoice follow-up automation. We have $1,500 USD for an initial experiment. The launch date is not decided. I cannot approve the budget; my manager decides.',
    extraction: { serviceRequest: 'invoice follow-up automation', budgetText: '$1,500 USD', timelineText: null, authorityText: 'I cannot approve the budget; my manager decides' },
    expectedScore: 45, expectedPriority: 'medium',
  },
  {
    id: 'outside-demo-service-fit',
    input: 'Could you design a brochure website for my new shop? I have $300 USD and need it within 2 days. I am comparing options.',
    extraction: { serviceRequest: 'brochure website', budgetText: '$300 USD', timelineText: 'within 2 days', authorityText: null },
    expectedScore: 0, expectedPriority: 'low',
  },
];
