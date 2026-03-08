import { describe, it, expect } from 'vitest';
import { conversationRepository } from './conversation.js';

describe('ConversationRepository (Mock)', () => {
  it('lists active conversations', async () => {
    const list = await conversationRepository.listActiveConversations();
    expect(list.length).toBeGreaterThan(0);
    const first = list[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe('conv_1');
  });

  it('gets timeline for a conversation', async () => {
    const timeline = await conversationRepository.getConversationTimeline('conv_1');
    expect(timeline.length).toBeGreaterThan(0);
    const first = timeline[0];
    expect(first).toBeDefined();
    expect(first?.type).toBe('message');
  });

  it('records a takeover event', async () => {
    await conversationRepository.takeoverConversation('conv_1', 'op_1');
    const timeline = await conversationRepository.getConversationTimeline('conv_1');
    const lastEvent = timeline[timeline.length - 1];
    expect(lastEvent).toBeDefined();
    expect(lastEvent?.type).toBe('event');
    if (!lastEvent || lastEvent.type !== 'event') {
      throw new Error('Expected the last timeline item to be an event');
    }
    expect(lastEvent.eventType).toBe('routing_decision');
    expect(lastEvent.details).toMatchObject({ action: 'manual_takeover' });
  });

  it('records a return to bot event', async () => {
    await conversationRepository.returnToBot('conv_1', 'op_1');
    const timeline = await conversationRepository.getConversationTimeline('conv_1');
    const lastEvent = timeline[timeline.length - 1];
    expect(lastEvent).toBeDefined();
    expect(lastEvent?.type).toBe('event');
    if (!lastEvent || lastEvent.type !== 'event') {
      throw new Error('Expected the last timeline item to be an event');
    }
    expect(lastEvent.eventType).toBe('routing_decision');
    expect(lastEvent.details).toMatchObject({ action: 'return_to_bot' });
  });

  it('adds an operator message', async () => {
    await conversationRepository.addOperatorMessage('conv_1', 'op_1', 'Hello there');
    const timeline = await conversationRepository.getConversationTimeline('conv_1');
    const lastEvent = timeline[timeline.length - 1];
    expect(lastEvent).toBeDefined();
    expect(lastEvent?.type).toBe('message');
    if (!lastEvent || lastEvent.type !== 'message') {
      throw new Error('Expected the last timeline item to be a message');
    }
    expect(lastEvent.senderRole).toBe('agent');
    expect(lastEvent.content).toBe('Hello there');
  });
});
