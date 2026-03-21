import { describe, expect, it, vi } from 'vitest';
import {
  orderStatusLookupTool,
  productInformationTool,
  shippingEstimateTool,
  supportTicketCreationTool,
} from '../src/tools/index.js';
import {
  OrderStatusLookupSchema,
  ProductInformationSchema,
  ShippingEstimateSchema,
  SupportTicketCreationSchema,
} from '../src/tools/schemas.js';
import { lookupOrderByPhone } from '../src/tools/repositories/orders.js';
import { searchProducts } from '../src/tools/repositories/products.js';
import { getShippingRules } from '../src/tools/repositories/shipping.js';
import { createSupportTicket } from '../src/tools/repositories/tickets.js';

vi.mock('../src/tools/repositories/orders.js', () => ({
  lookupOrderByPhone: vi.fn(),
}));

vi.mock('../src/tools/repositories/products.js', () => ({
  searchProducts: vi.fn(),
}));

vi.mock('../src/tools/repositories/shipping.js', () => ({
  getShippingRules: vi.fn(),
}));

vi.mock('../src/tools/repositories/tickets.js', () => ({
  createSupportTicket: vi.fn(),
}));

describe('Tool Contracts and Schemas (I1)', () => {
  describe('Schema Validation', () => {
    it('should validate OrderStatusLookupSchema correctly', () => {
      const validPayload = { orderId: 'ORD-123', customerPhone: '+628123456789' };
      const parsed = OrderStatusLookupSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      const invalidPayload = { orderId: 'ORD-123' };
      const parsedInvalid = OrderStatusLookupSchema.safeParse(invalidPayload);
      expect(parsedInvalid.success).toBe(false);
    });

    it('should validate ProductInformationSchema correctly', () => {
      const validPayload = { query: 'laptop', category: 'electronics' };
      const parsed = ProductInformationSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      const validPayloadNoCategory = { query: 'laptop' };
      const parsedNoCategory = ProductInformationSchema.safeParse(validPayloadNoCategory);
      expect(parsedNoCategory.success).toBe(true);

      const invalidPayload = { category: 'electronics' }; // missing query
      const parsedInvalid = ProductInformationSchema.safeParse(invalidPayload);
      expect(parsedInvalid.success).toBe(false);
    });

    it('should validate ShippingEstimateSchema correctly', () => {
      const validPayload = {
        destinationZipCode: '10001',
        destinationCountry: 'US',
        destinationCity: 'New York',
        weightKg: 2.5,
      };
      const parsed = ShippingEstimateSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      const invalidPayload = {
        destinationZipCode: '10001',
        destinationCountry: 'US',
        destinationCity: 'New York',
        weightKg: -5,
      };
      const parsedInvalid = ShippingEstimateSchema.safeParse(invalidPayload);
      expect(parsedInvalid.success).toBe(false);
    });

    it('should validate SupportTicketCreationSchema correctly', () => {
      const validPayload = {
        conversationId: 'conversation-123',
        customerEmail: 'customer@example.com',
        customerPhone: '+628123456789',
        issueDescription: 'My order has not arrived after 2 weeks, please help.',
        category: 'shipping' as const,
        priority: 'high' as const,
      };
      const parsed = SupportTicketCreationSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      const invalidPayloadShortDesc = {
        conversationId: 'conversation-123',
        customerEmail: 'customer@example.com',
        customerPhone: '+628123456789',
        issueDescription: 'Help', // min 10 chars
        category: 'shipping' as const,
      };
      const parsedInvalid = SupportTicketCreationSchema.safeParse(invalidPayloadShortDesc);
      expect(parsedInvalid.success).toBe(false);
    });
  });

  describe('Tool Execution Blocks (Repository-backed)', () => {
    it('orderStatusLookupTool should return order data JSON', async () => {
      vi.mocked(lookupOrderByPhone).mockResolvedValueOnce({
        order: {
          id: 'order-123',
          external_order_id: 'ORD-123',
          customer_phone: '+628123456789',
          customer_email: 'test@example.com',
          status: 'processing',
          payment_status: 'paid',
          fulfillment_status: 'picking',
          currency: 'USD',
          total_amount: 100,
          placed_at: null,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        shipments: [],
      });

      const resultStr = await orderStatusLookupTool.invoke({
        orderId: 'ORD-123',
        customerPhone: '+628123456789',
      });
      const result = JSON.parse(resultStr);
      expect(result.found).toBe(true);
      expect(result.order.external_order_id).toBe('ORD-123');
      expect(result.order.status).toBe('processing');
    });

    it('productInformationTool should return product search JSON', async () => {
      vi.mocked(searchProducts).mockResolvedValueOnce([
        {
          id: 'prod-1',
          external_product_id: 'PRD-1',
          name: 'Headphones',
          description: 'Wireless headphones',
          price: 99.99,
          currency: 'USD',
          category: 'electronics',
          in_stock: true,
          stock_qty: 10,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      const resultStr = await productInformationTool.invoke({ query: 'headphones' });
      const result = JSON.parse(resultStr);
      expect(result.query).toBe('headphones');
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('shippingEstimateTool should return shipping options JSON', async () => {
      vi.mocked(getShippingRules).mockResolvedValueOnce([
        {
          id: 'rule-1',
          origin_country: 'ID',
          destination_country: 'US',
          destination_city: 'Schenectady',
          weight_min_kg: 0,
          weight_max_kg: 2,
          service_level: 'standard',
          courier_name: 'JNE',
          cost: 5.99,
          currency: 'USD',
          estimated_days_min: 5,
          estimated_days_max: 7,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ]);

      const resultStr = await shippingEstimateTool.invoke({
        destinationZipCode: '12345',
        destinationCountry: 'US',
        destinationCity: 'Schenectady',
      });
      const result = JSON.parse(resultStr);
      expect(result.destination.zipCode).toBe('12345');
      expect(result.destination.country).toBe('US');
      expect(result.options.length).toBe(1);
    });

    it('supportTicketCreationTool should return created ticket JSON', async () => {
      vi.mocked(createSupportTicket).mockResolvedValueOnce({
        id: 'ticket-123',
        conversation_id: 'conversation-123',
        external_ticket_id: null,
        status: 'open',
        priority: 'normal',
        metadata: {
          issueDescription: 'This is a valid long description.',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const resultStr = await supportTicketCreationTool.invoke({
        conversationId: 'conversation-123',
        customerEmail: 'customer@example.com',
        customerPhone: '+628123456789',
        issueDescription: 'This is a valid long description.',
        category: 'general',
        confirmed: true,
      });
      const result = JSON.parse(resultStr);
      expect(result.status).toBe('open');
      expect(result.message).toContain('Tiket support berhasil dibuat');
      expect(result.ticketId).toBe('ticket-123');
    });
  });
});
