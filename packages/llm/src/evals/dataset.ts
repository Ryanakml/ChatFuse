export interface EvalCase {
  question: string;
  expectedContextKeywords: string[];
  expectedAnswerSubstring: string;
}

export const EVAL_DATASET: EvalCase[] = [
  {
    question: 'What is your refund policy?',
    expectedContextKeywords: ['refund', 'days'],
    expectedAnswerSubstring: 'refund',
  },
  {
    question: 'How do I cancel my subscription?',
    expectedContextKeywords: ['cancel', 'subscription', 'account'],
    expectedAnswerSubstring: 'cancel',
  },
  {
    question: 'Do you offer international shipping?',
    expectedContextKeywords: ['international', 'shipping', 'countries'],
    expectedAnswerSubstring: 'shipping',
  },
  {
    question: 'What are your support hours?',
    expectedContextKeywords: ['hours', 'support', 'time'],
    expectedAnswerSubstring: 'hours',
  },
  {
    question: 'Can I change my account email?',
    expectedContextKeywords: ['email', 'account', 'settings'],
    expectedAnswerSubstring: 'email',
  },
];
