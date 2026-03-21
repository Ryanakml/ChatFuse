import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { CircuitBreaker, withRetry, withTimeout } from './reliability.js';
import {
  OrderStatusLookupSchema,
  ProductInformationSchema,
  ShippingEstimateSchema,
  SupportTicketCreationSchema,
} from './schemas.js';
import { lookupOrderByPhone } from './repositories/orders.js';
import { searchProducts } from './repositories/products.js';
import { getShippingRules } from './repositories/shipping.js';
import { createSupportTicket } from './repositories/tickets.js';

export * from './schemas.js';
export * from './reliability.js';
import { appMetrics } from '@wa-chat/shared';

/**
 * Helper to provide a human-safe fallback message when a tool fails (e.g., timeout, circuit breaker open).
 */
async function withSafeFallback(
  promiseFn: () => Promise<string>,
  toolName: string,
): Promise<string> {
  try {
    const result = await promiseFn();
    appMetrics.toolExecutionCount.add(1, { tool: toolName, status: 'success' });
    return result;
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.message.includes('timeout') || error.name === 'TimeoutError');
    appMetrics.toolExecutionCount.add(1, {
      tool: toolName,
      status: isTimeout ? 'timeout' : 'error',
    });
    console.error(
      `[Tool Error] ${toolName} failed:`,
      error instanceof Error ? error.message : error,
    );
    return 'Maaf, sistem sedang mengalami kendala teknis. Silakan coba lagi sebentar lagi atau minta bantuan agen manusia.';
  }
}

/**
 * Tool for looking up the status of an order.
 */
const orderStatusCb = new CircuitBreaker({});

export const orderStatusLookupTool = new DynamicStructuredTool({
  name: 'order_status_lookup',
  description:
    'Lookup the current status and details of a customer order using the customer phone and optional order ID.',
  schema: OrderStatusLookupSchema,
  func: async ({ orderId, customerPhone }) => {
    return withSafeFallback(async () => {
      return orderStatusCb.execute(() =>
        withRetry(() =>
          withTimeout(async () => {
            const result = await lookupOrderByPhone(customerPhone, orderId);

            if (!result) {
              return JSON.stringify({
                found: false,
                orderId: orderId ?? null,
                customerPhone,
                message: 'No matching order was found for this phone number.',
              });
            }

            return JSON.stringify({
              found: true,
              order: result.order,
              shipments: result.shipments,
            });
          }, 5000),
        ),
      );
    }, 'order_status_lookup');
  },
});

/**
 * Tool for searching and retrieving product information.
 */
const productInfoCb = new CircuitBreaker({});

export const productInformationTool = new DynamicStructuredTool({
  name: 'product_information',
  description:
    'Search for products and retrieve detailed information like price, availability, and specs.',
  schema: ProductInformationSchema,
  func: async ({ query, category, limit }) => {
    return withSafeFallback(async () => {
      return productInfoCb.execute(() =>
        withRetry(() =>
          withTimeout(async () => {
            const products = await searchProducts(query, category, limit);
            return JSON.stringify({
              query,
              category,
              limit: limit ?? 10,
              count: products.length,
              results: products,
            });
          }, 5000),
        ),
      );
    }, 'product_information');
  },
});

/**
 * Tool for calculating a shipping estimate.
 */
const shippingCb = new CircuitBreaker({});

export const shippingEstimateTool = new DynamicStructuredTool({
  name: 'shipping_estimate',
  description: 'Calculate standard and express shipping cost and time estimates.',
  schema: ShippingEstimateSchema,
  func: async ({ destinationZipCode, destinationCountry, destinationCity, weightKg }) => {
    return withSafeFallback(async () => {
      return shippingCb.execute(() =>
        withRetry(() =>
          withTimeout(async () => {
            const rules = await getShippingRules(destinationCountry, destinationCity, weightKg);

            return JSON.stringify({
              destination: {
                zipCode: destinationZipCode ?? null,
                country: destinationCountry,
                city: destinationCity ?? null,
              },
              weightKg: weightKg ?? null,
              count: rules.length,
              options: rules,
            });
          }, 5000),
        ),
      );
    }, 'shipping_estimate');
  },
});

/**
 * Tool for creating a new customer support ticket.
 */
const supportTicketCb = new CircuitBreaker({});

export const supportTicketCreationTool = new DynamicStructuredTool({
  name: 'support_ticket_creation',
  description: 'Create a new support ticket for a user issue. This is a write operation.',
  schema: SupportTicketCreationSchema,
  func: async ({
    conversationId,
    issueDescription,
    category,
    priority,
    customerPhone,
    idempotencyKey,
    confirmed,
  }) => {
    if (!confirmed) {
      return `Mohon konfirmasi pembuatan tiket dengan detail berikut:
- Kategori: ${category}
- Prioritas: ${priority || 'medium'}
- Deskripsi: ${issueDescription}

Balas "ya" untuk konfirmasi atau "tidak" untuk batal.`;
    }

    return withSafeFallback(async () => {
      return supportTicketCb.execute(() =>
        withRetry(
          () =>
            withTimeout(async () => {
              // Log BEFORE state for mutable operation
              console.log(
                JSON.stringify({
                  event: 'tool_execution_start',
                  tool: 'support_ticket_creation',
                  input: {
                    conversationId,
                    issueDescription,
                    category,
                    priority,
                    customerPhone,
                    idempotencyKey,
                  },
                  timestamp: new Date().toISOString(),
                }),
              );

              const ticket = await createSupportTicket({
                conversationId,
                category,
                priority: priority ?? 'medium',
                issueDescription,
                ...(customerPhone ? { customerPhone } : {}),
                ...(idempotencyKey ? { idempotencyKey } : {}),
              });

              const result = {
                ticketId: ticket.id,
                status: ticket.status,
                priority: ticket.priority,
                metadata: ticket.metadata,
                message: 'Tiket support berhasil dibuat. Agen manusia akan menindaklanjuti secepatnya.',
              };

              // Log AFTER state
              console.log(
                JSON.stringify({
                  event: 'tool_execution_success',
                  tool: 'support_ticket_creation',
                  result,
                  timestamp: new Date().toISOString(),
                }),
              );

              return JSON.stringify(result);
            }, 8000), // Writes might take longer generally
        ),
      );
    }, 'support_ticket_creation');
  },
});

/**
 * Tool to escalate a conversation to a human agent.
 */
export const escalateToHumanTool = new DynamicStructuredTool({
  name: 'escalate_to_human',
  description:
    'Escalate the conversation to a human support agent when the user explicitly requests one, or when their intent is ambiguous or cannot be handled by other tools.',
  schema: z.object({
    reason: z
      .string()
      .describe(
        'The reason for escalating the conversation to a human agent, summarizing the context.',
      ),
  }),
  func: async ({ reason }) => {
    console.log(
      JSON.stringify({
        event: 'escalation_triggered',
        reason,
        timestamp: new Date().toISOString(),
      }),
    );
    return 'Permintaan Anda sudah saya eskalasikan ke agen customer service manusia. Mohon tunggu, tim kami akan segera membantu.';
  },
});

/**
 * Array of all standard business tools available to the agent.
 */
export const businessTools = [
  orderStatusLookupTool,
  productInformationTool,
  shippingEstimateTool,
  supportTicketCreationTool,
  escalateToHumanTool,
];
