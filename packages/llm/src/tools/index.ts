import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { CircuitBreaker, withRetry, withTimeout } from './reliability.js';
import {
  OrderStatusLookupSchema,
  ProductInformationSchema,
  ShippingEstimateSchema,
  SupportTicketCreationSchema,
} from './schemas.js';

export * from './schemas.js';
export * from './reliability.js';

/**
 * Helper to provide a human-safe fallback message when a tool fails (e.g., timeout, circuit breaker open).
 */
async function withSafeFallback(
  promiseFn: () => Promise<string>,
  toolName: string,
): Promise<string> {
  try {
    return await promiseFn();
  } catch (error) {
    console.error(
      `[Tool Error] ${toolName} failed:`,
      error instanceof Error ? error.message : error,
    );
    return `I'm currently unable to complete this action due to a technical issue. Please try again later or type 'escalate' to speak with a human agent.`;
  }
}

/**
 * Tool for looking up the status of an order.
 */
const orderStatusCb = new CircuitBreaker({});

export const orderStatusLookupTool = new DynamicStructuredTool({
  name: 'order_status_lookup',
  description:
    'Lookup the current status and details of a customer order using the order ID and email.',
  schema: OrderStatusLookupSchema,
  func: async ({ orderId, customerEmail }) => {
    return withSafeFallback(async () => {
      return orderStatusCb.execute(() =>
        withRetry(() =>
          withTimeout(async () => {
            // TODO: Implement actual business logic (e.g. calling an internal API or database)
            // For now, return a mock response
            return JSON.stringify({
              orderId,
              customerEmail,
              status: 'processing',
              estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
              message: 'Order is currently being processed and will ship soon.',
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
  func: async ({ query, category }) => {
    return withSafeFallback(async () => {
      return productInfoCb.execute(() =>
        withRetry(() =>
          withTimeout(async () => {
            // TODO: Implement actual business logic
            return JSON.stringify({
              query,
              category,
              results: [
                {
                  id: 'PROD-001',
                  name: 'Wireless Headphones',
                  price: 99.99,
                  inStock: true,
                  description: 'High-quality noise-canceling wireless headphones.',
                },
              ],
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
  func: async ({ destinationZipCode, destinationCountry, weightKg }) => {
    return withSafeFallback(async () => {
      return shippingCb.execute(() =>
        withRetry(() =>
          withTimeout(async () => {
            // TODO: Implement actual business logic
            return JSON.stringify({
              destination: { zipCode: destinationZipCode, country: destinationCountry },
              options: [
                { method: 'Standard', cost: 5.99, estimatedDays: '5-7 business days' },
                { method: 'Express', cost: 14.99, estimatedDays: '1-2 business days' },
              ],
              weightKg: weightKg || 1.0,
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
  func: async ({ issueDescription, category, priority, idempotencyKey, confirmed }) => {
    if (!confirmed) {
      return `Please confirm that you would like to create a support ticket with the following details:
- Category: ${category}
- Priority: ${priority || 'medium'}
- Description: ${issueDescription}

Reply with 'yes' to confirm or 'no' to cancel.`;
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
                  input: { issueDescription, category, priority, idempotencyKey },
                  timestamp: new Date().toISOString(),
                }),
              );

              // TODO: Implement actual business logic
              const result = {
                ticketId: `TICKET-${Math.floor(Math.random() * 10000)}`,
                status: 'created',
                issueDescription,
                category,
                priority,
                idempotencyKey, // Reflecting the key to confirm idempotency handling
                message:
                  'Support ticket successfully created. A human agent will review it shortly.',
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
    return 'I have escalated your request to a human support agent. They will review your conversation history and respond to you as soon as possible.';
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
