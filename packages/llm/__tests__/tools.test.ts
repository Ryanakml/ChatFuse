import { describe, expect, it } from 'vitest';
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

describe('Tool Contracts and Schemas (I1)', () => {
  describe('Schema Validation', () => {
    it('should validate OrderStatusLookupSchema correctly', () => {
      const validPayload = { orderId: 'ORD-123', customerEmail: 'test@example.com' };
      const parsed = OrderStatusLookupSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      const invalidPayload = { orderId: 'ORD-123', customerEmail: 'not-an-email' };
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
      const validPayload = { destinationZipCode: '10001', destinationCountry: 'US', weightKg: 2.5 };
      const parsed = ShippingEstimateSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      const invalidPayload = {
        destinationZipCode: '10001',
        destinationCountry: 'US',
        weightKg: -5,
      };
      const parsedInvalid = ShippingEstimateSchema.safeParse(invalidPayload);
      expect(parsedInvalid.success).toBe(false);
    });

    it('should validate SupportTicketCreationSchema correctly', () => {
      const validPayload = {
        issueDescription: 'My order has not arrived after 2 weeks, please help.',
        category: 'shipping' as const,
        priority: 'high' as const,
      };
      const parsed = SupportTicketCreationSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      const invalidPayloadShortDesc = {
        issueDescription: 'Help', // min 10 chars
        category: 'shipping' as const,
      };
      const parsedInvalid = SupportTicketCreationSchema.safeParse(invalidPayloadShortDesc);
      expect(parsedInvalid.success).toBe(false);
    });
  });

  describe('Tool Execution Blocks (Mock Returns)', () => {
    it('orderStatusLookupTool should return mock JSON', async () => {
      const resultStr = await orderStatusLookupTool.invoke({
        orderId: 'ORD-123',
        customerEmail: 'test@example.com',
      });
      const result = JSON.parse(resultStr);
      expect(result.orderId).toBe('ORD-123');
      expect(result.status).toBe('processing');
    });

    it('productInformationTool should return mock JSON', async () => {
      const resultStr = await productInformationTool.invoke({ query: 'headphones' });
      const result = JSON.parse(resultStr);
      expect(result.query).toBe('headphones');
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('shippingEstimateTool should return mock JSON', async () => {
      const resultStr = await shippingEstimateTool.invoke({
        destinationZipCode: '12345',
        destinationCountry: 'US',
      });
      const result = JSON.parse(resultStr);
      expect(result.destination.zipCode).toBe('12345');
      expect(result.options.length).toBe(2);
    });

    it('supportTicketCreationTool should return mock JSON', async () => {
      const resultStr = await supportTicketCreationTool.invoke({
        issueDescription: 'This is a valid long description.',
        category: 'general',
        confirmed: true,
      });
      const result = JSON.parse(resultStr);
      expect(result.status).toBe('created');
      expect(result.message).toContain('Support ticket successfully created');
      expect(result.issueDescription).toBe('This is a valid long description.');
    });
  });
});
