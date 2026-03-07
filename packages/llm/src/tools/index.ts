import { DynamicStructuredTool } from '@langchain/core/tools';
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
 * Tool for looking up the status of an order.
 */
const orderStatusCb = new CircuitBreaker({});

export const orderStatusLookupTool = new DynamicStructuredTool({
  name: 'order_status_lookup',
  description:
    'Lookup the current status and details of a customer order using the order ID and email.',
  schema: OrderStatusLookupSchema,
  func: async ({ orderId, customerEmail }) => {
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
  func: async ({ issueDescription, category, priority, idempotencyKey }) => {
    return supportTicketCb.execute(() =>
      withRetry(
        () =>
          withTimeout(async () => {
            // TODO: Implement actual business logic
            return JSON.stringify({
              ticketId: `TICKET-${Math.floor(Math.random() * 10000)}`,
              status: 'created',
              issueDescription,
              category,
              priority,
              idempotencyKey, // Reflecting the key to confirm idempotency handling
              message: 'Support ticket successfully created. A human agent will review it shortly.',
            });
          }, 8000), // Writes might take longer generally
      ),
    );
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
];
