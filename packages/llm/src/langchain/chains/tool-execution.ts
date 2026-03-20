import { RunnableLambda } from '@langchain/core/runnables';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { appMetrics, logger } from '@wa-chat/shared';
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

const extractOrderId = (text: string): string => {
  const match = text.match(/\b(?:ord[-\s]?)?(\d{3,})\b/i);
  return match?.[1] ? `ORD-${match[1]}` : 'ORD-12345';
};

const extractCustomerPhone = (text: string): string => {
  const match = text.match(/(\+62|08)\d{8,11}/);
  return match?.[0] ?? '';
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

const detectToolFromInput = (normalizedInput: string): ToolSelection | null => {
  const text = normalizedInput.toLowerCase();

  if (/(status|pesanan|order|lacak|track)/i.test(text)) {
    return {
      toolName: 'order_status_lookup',
      toolInput: {
        orderId: extractOrderId(normalizedInput),
        customerPhone: extractCustomerPhone(normalizedInput),
      },
    };
  }

  if (/(produk|product|barang|katalog|catalog)/i.test(text)) {
    return {
      toolName: 'product_information',
      toolInput: {
        query: normalizedInput,
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

  if (/(ticket|keluhan|komplain|masalah|bantuan teknis|support)/i.test(text)) {
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
  if (toolName === 'order_status_lookup') {
    return {
      orderId: extractOrderId(normalizedInput),
      customerPhone: extractCustomerPhone(normalizedInput),
    };
  }

  if (toolName === 'product_information') {
    return {
      query: normalizedInput,
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
    return {
      conversationId: state?.context?.conversationId ?? '',
      issueDescription: normalizedInput,
      category: 'general',
      priority: 'medium',
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
    const fallback = detectToolFromInput(normalizedInput);
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
