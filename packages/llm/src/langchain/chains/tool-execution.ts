import { RunnableLambda } from '@langchain/core/runnables';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { appMetrics, logger, normalizeIndonesianPhoneNumber } from '@wa-chat/shared';
import type { BaseMessage } from '@langchain/core/messages';
import { businessTools } from '../../tools/index.js';
import type { AgentState } from '../types.js';
import { classifyToolWithGroq, type RoutedToolName } from './groq-classifier.js';

const SAFE_TOOL_FAILURE_RESPONSE =
  'Maaf, saya belum bisa menjalankan permintaan itu saat ini. Silakan coba lagi atau minta bantuan agen manusia.';

const getToolByName = (toolName: string): StructuredToolInterface | undefined =>
  businessTools.find((tool) => tool.name === toolName);

type ToolSelection = {
  toolName: string;
  toolInput: Record<string, unknown>;
};

type ClassifiedToolName = Exclude<RoutedToolName, 'none'>;

const extractOrderId = (text: string): string | undefined => {
  const match = text.match(/\b(?:ord[-\s]?)?(\d{3,})\b/i);
  return match?.[1] ? `ORD-${match[1]}` : undefined;
};

const extractCustomerPhone = (text: string): string => {
  const match = text.match(/(?:\+?62|0)?8\d{7,12}/);
  if (!match?.[0]) {
    return '';
  }

  return normalizeIndonesianPhoneNumber(match[0]) ?? match[0];
};

const isAffirmativeInput = (text: string): boolean =>
  /^(ya|iya|yes|y|ok|oke|lanjut|silakan|gas)\b/i.test(text.trim());

const getHistory = (state?: AgentState): BaseMessage[] => (state?.context?.history ?? []) as BaseMessage[];

const getLatestPhoneFromHistory = (state?: AgentState): string => {
  const history = getHistory(state);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message) {
      continue;
    }
    if (message.type !== 'human' || typeof message.content !== 'string') {
      continue;
    }
    const candidate = extractCustomerPhone(message.content);
    if (candidate) {
      return candidate;
    }
  }
  return '';
};

const getLastAssistantMessage = (state?: AgentState): string => {
  const history = getHistory(state);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message) {
      continue;
    }
    if (message.type !== 'ai' || typeof message.content !== 'string') {
      continue;
    }
    return message.content;
  }
  return '';
};

const getLastUserMessage = (state?: AgentState): string => {
  const history = getHistory(state);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message) {
      continue;
    }
    if (message.type !== 'human' || typeof message.content !== 'string') {
      continue;
    }
    return message.content;
  }
  return '';
};

const isPendingOrderRetry = (state?: AgentState): boolean => {
  const lastAssistantMessage = getLastAssistantMessage(state).toLowerCase();
  return (
    (lastAssistantMessage.includes('cari pesanan') && lastAssistantMessage.includes('lagi')) ||
    lastAssistantMessage.includes('mencari pesanan anda lagi')
  );
};

const normalizeSupportCategory = (rawCategory?: string): 'billing' | 'technical' | 'shipping' | 'general' => {
  const category = (rawCategory ?? '').trim().toLowerCase();
  if (category.includes('billing') || category.includes('tagihan')) {
    return 'billing';
  }
  if (category.includes('teknis') || category.includes('technical')) {
    return 'technical';
  }
  if (category.includes('shipping') || category.includes('pengiriman')) {
    return 'shipping';
  }
  return 'general';
};

const normalizeSupportPriority = (rawPriority?: string): 'low' | 'medium' | 'high' | 'urgent' => {
  const priority = (rawPriority ?? '').trim().toLowerCase();
  if (priority.includes('urgent') || priority.includes('mendesak')) {
    return 'urgent';
  }
  if (priority.includes('high') || priority.includes('tinggi')) {
    return 'high';
  }
  if (priority.includes('low') || priority.includes('rendah')) {
    return 'low';
  }
  return 'medium';
};

const extractPendingSupportFromLastAssistant = (
  state?: AgentState,
): { category: 'billing' | 'technical' | 'shipping' | 'general'; priority: 'low' | 'medium' | 'high' | 'urgent'; issueDescription: string } | null => {
  const lastAssistantMessage = getLastAssistantMessage(state);
  if (!lastAssistantMessage) {
    return null;
  }

  const supportCue =
    /balas[\s\S]*["']?ya["']?[\s\S]*(konfirmasi|batal)/i.test(lastAssistantMessage) ||
    /reply[\s\S]*["']?yes["']?[\s\S]*(confirm|cancel)/i.test(lastAssistantMessage);

  if (!supportCue) {
    return null;
  }

  const categoryMatch = lastAssistantMessage.match(/kategori:\s*(.+)/i);
  const priorityMatch = lastAssistantMessage.match(/prioritas:\s*(.+)/i);
  const descriptionMatch = lastAssistantMessage.match(/deskripsi:\s*(.+)/i);

  const fallbackDescription = getLastUserMessage(state);

  return {
    category: normalizeSupportCategory(categoryMatch?.[1]),
    priority: normalizeSupportPriority(priorityMatch?.[1]),
    issueDescription: (descriptionMatch?.[1] ?? fallbackDescription).trim(),
  };
};

const extractDestinationCity = (text: string): string | null => {
  const cityCandidates = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Bali'] as const;
  const normalized = text.toLowerCase();

  for (const city of cityCandidates) {
    if (normalized.includes(city.toLowerCase())) {
      return city;
    }
  }

  return null;
};

const normalizeProductQuery = (text: string): string => {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const stopWords = new Set([
    'ada',
    'gak',
    'ga',
    'tidak',
    'dong',
    'kah',
    'ya',
    'mau',
    'cari',
    'produk',
    'barang',
    'yang',
    'ini',
    'itu',
    'please',
    'tolong',
  ]);

  const tokens = cleaned.split(' ').filter((token) => token.length > 1 && !stopWords.has(token));
  return tokens.join(' ').trim() || text.trim();
};

const detectToolFromInput = (normalizedInput: string, state?: AgentState): ToolSelection | null => {
  const text = normalizedInput.toLowerCase();
  const phoneFromInput = extractCustomerPhone(normalizedInput);
  const phoneFromHistory = getLatestPhoneFromHistory(state);
  const resolvedPhone = phoneFromInput || phoneFromHistory;
  const extractedOrderId = extractOrderId(normalizedInput);
  const pendingSupport = extractPendingSupportFromLastAssistant(state);

  if (/(status|pesanan|order|lacak|track)/i.test(text) || (phoneFromInput && isPendingOrderRetry(state))) {
    return {
      toolName: 'order_status_lookup',
      toolInput: {
        ...(extractedOrderId ? { orderId: extractedOrderId } : {}),
        customerPhone: resolvedPhone,
      },
    };
  }

  if (isAffirmativeInput(normalizedInput) && pendingSupport) {
    return {
      toolName: 'support_ticket_creation',
      toolInput: {
        conversationId: state?.context?.conversationId ?? '',
        category: pendingSupport.category,
        priority: pendingSupport.priority,
        issueDescription: pendingSupport.issueDescription,
        customerPhone: resolvedPhone,
        confirmed: true,
      },
    };
  }

  if (/(produk|product|barang|katalog|catalog)/i.test(text)) {
    return {
      toolName: 'product_information',
      toolInput: {
        query: normalizeProductQuery(normalizedInput),
      },
    };
  }

  if (/(ongkir|kirim|shipping|delivery|pengiriman)/i.test(text)) {
    const destinationCity = extractDestinationCity(normalizedInput);

    return {
      toolName: 'shipping_estimate',
      toolInput: {
        destinationZipCode: '10110',
        destinationCountry: 'ID',
        ...(destinationCity ? { destinationCity } : {}),
        weightKg: 1,
      },
    };
  }

  if (/(ticket|tiket|keluhan|komplain|masalah|bantuan teknis|support)/i.test(text)) {
    return {
      toolName: 'support_ticket_creation',
      toolInput: {
        issueDescription: normalizedInput,
        category: 'general',
        priority: 'medium',
        confirmed: false,
      },
    };
  }

  if (/(agent|human|manusia|cs|admin|escalate|eskalasi)/i.test(text)) {
    return {
      toolName: 'escalate_to_human',
      toolInput: {
        reason: normalizedInput,
      },
    };
  }

  return null;
};

const buildToolInput = (
  toolName: ClassifiedToolName,
  normalizedInput: string,
  state?: AgentState,
): Record<string, unknown> => {
  const phoneFromInput = extractCustomerPhone(normalizedInput);
  const phoneFromHistory = getLatestPhoneFromHistory(state);
  const resolvedPhone = phoneFromInput || phoneFromHistory;
  const extractedOrderId = extractOrderId(normalizedInput);
  const pendingSupport = extractPendingSupportFromLastAssistant(state);

  if (toolName === 'order_status_lookup') {
    return {
      ...(extractedOrderId ? { orderId: extractedOrderId } : {}),
      customerPhone: resolvedPhone,
    };
  }

  if (toolName === 'product_information') {
    return {
      query: normalizeProductQuery(normalizedInput),
    };
  }

  if (toolName === 'shipping_estimate') {
    const destinationCity = extractDestinationCity(normalizedInput);

    return {
      destinationZipCode: '10110',
      destinationCountry: 'ID',
      ...(destinationCity ? { destinationCity } : {}),
      weightKg: 1,
    };
  }

  if (toolName === 'support_ticket_creation') {
    if (isAffirmativeInput(normalizedInput) && pendingSupport) {
      return {
        conversationId: state?.context?.conversationId ?? '',
        category: pendingSupport.category,
        priority: pendingSupport.priority,
        issueDescription: pendingSupport.issueDescription,
        customerPhone: resolvedPhone,
        confirmed: true,
      };
    }

    return {
      conversationId: state?.context?.conversationId ?? '',
      issueDescription: normalizedInput,
      category: 'general',
      priority: 'medium',
      customerPhone: resolvedPhone,
      confirmed: false,
    };
  }

  return {
    reason: normalizedInput,
  };
};

const classifyToolSelection = async (
  normalizedInput: string,
  state?: AgentState,
): Promise<{ selection: ToolSelection | null; source: 'GROQ' | 'FALLBACK' }> => {
  const fallbackFirst = detectToolFromInput(normalizedInput, state);

  // Deterministic override for short follow-up turns where LLM classifiers are often brittle.
  if (fallbackFirst && (isAffirmativeInput(normalizedInput) || extractCustomerPhone(normalizedInput))) {
    return {
      selection: fallbackFirst,
      source: 'FALLBACK',
    };
  }

  try {
    const classified = await classifyToolWithGroq(normalizedInput);
    logger.debug(
      {
        classificationSource: 'GROQ',
        toolName: classified.toolName,
        confidence: classified.confidence,
      },
      'Tool selection completed',
    );

    if (classified.toolName === 'none') {
      return {
        selection: null,
        source: 'GROQ',
      };
    }

    return {
      selection: {
        toolName: classified.toolName,
        toolInput: buildToolInput(classified.toolName, normalizedInput, state),
      },
      source: 'GROQ',
    };
  } catch (error) {
    const fallback = detectToolFromInput(normalizedInput, state);
    appMetrics.agentParseFailureCount?.add?.(1, {
      stage: 'tool_selection',
      source: 'fallback',
    });
    logger.warn(
      {
        error,
        classificationSource: 'FALLBACK',
        toolName: fallback?.toolName ?? null,
      },
      'Groq tool selection failed, fallback used',
    );

    return {
      selection: fallback,
      source: 'FALLBACK',
    };
  }
};

/**
 * Step 6: Tool execution chain.
 * For POC, tools still return mock outputs from the tool definitions and are safe to wire end-to-end.
 */
export const toolExecutionChain = RunnableLambda.from(async (state: AgentState) => {
  if (state.route !== 'tool_path') {
    return state;
  }

  const normalizedInput = state.normalizedInput || '';
  const { selection: detectedTool } = await classifyToolSelection(normalizedInput, state);

  if (!detectedTool) {
    return {
      ...state,
      composedResponse:
        'Saya butuh detail tambahan untuk menjalankan aksi ini. Mohon jelaskan kebutuhan Anda secara lebih spesifik.',
      toolExecution: {
        toolName: null,
        toolInput: null,
        toolOutput: null,
        toolDurationMs: 0,
        toolSuccess: false,
      },
    } as AgentState;
  }

  const tool = getToolByName(detectedTool.toolName);
  if (!tool) {
    return {
      ...state,
      composedResponse: SAFE_TOOL_FAILURE_RESPONSE,
      toolExecution: {
        toolName: detectedTool.toolName,
        toolInput: detectedTool.toolInput,
        toolOutput: null,
        toolDurationMs: 0,
        toolSuccess: false,
      },
    } as AgentState;
  }

  const startedAt = Date.now();

  try {
    const toolOutput = await tool.invoke(detectedTool.toolInput);

    return {
      ...state,
      composedResponse:
        typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput, null, 2),
      toolExecution: {
        toolName: tool.name,
        toolInput: detectedTool.toolInput,
        toolOutput,
        toolDurationMs: Date.now() - startedAt,
        toolSuccess: true,
      },
    } as AgentState;
  } catch {
    return {
      ...state,
      composedResponse: SAFE_TOOL_FAILURE_RESPONSE,
      toolExecution: {
        toolName: detectedTool.toolName,
        toolInput: detectedTool.toolInput,
        toolOutput: null,
        toolDurationMs: Date.now() - startedAt,
        toolSuccess: false,
      },
    } as AgentState;
  }
});
