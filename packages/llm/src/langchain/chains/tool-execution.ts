import { RunnableLambda } from '@langchain/core/runnables';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { businessTools } from '../../tools/index.js';
import type { AgentState } from '../types.js';

const SAFE_TOOL_FAILURE_RESPONSE =
  'Maaf, saya belum bisa menjalankan permintaan itu saat ini. Silakan coba lagi atau minta bantuan agen manusia.';

const getToolByName = (toolName: string): StructuredToolInterface | undefined =>
  businessTools.find((tool) => tool.name === toolName);

type ToolSelection = {
  toolName: string;
  toolInput: Record<string, unknown>;
};

const extractOrderId = (text: string): string => {
  const match = text.match(/\b(?:ord[-\s]?)?(\d{3,})\b/i);
  return match?.[1] ? `ORD-${match[1]}` : 'ORD-12345';
};

const detectToolFromInput = (normalizedInput: string): ToolSelection | null => {
  const text = normalizedInput.toLowerCase();

  if (/(status|pesanan|order|lacak|track)/i.test(text)) {
    return {
      toolName: 'order_status_lookup',
      toolInput: {
        orderId: extractOrderId(normalizedInput),
        customerEmail: 'customer@example.com',
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
    return {
      toolName: 'shipping_estimate',
      toolInput: {
        destinationZipCode: '10110',
        destinationCountry: 'ID',
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

/**
 * Step 6: Tool execution chain.
 * For POC, tools still return mock outputs from the tool definitions and are safe to wire end-to-end.
 */
export const toolExecutionChain = RunnableLambda.from(async (state: AgentState) => {
  if (state.route !== 'tool_path') {
    return state;
  }

  const normalizedInput = state.normalizedInput || '';
  const detectedTool = detectToolFromInput(normalizedInput);

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
