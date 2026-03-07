import { z } from 'zod';

/**
 * Schema for looking up order status
 */
export const OrderStatusLookupSchema = z.object({
  orderId: z.string().describe('The unique identifier for the order (e.g., ORD-12345)'),
  customerEmail: z.string().email().describe('The email address associated with the order'),
});

export type OrderStatusLookupInput = z.infer<typeof OrderStatusLookupSchema>;

/**
 * Schema for querying product information
 */
export const ProductInformationSchema = z.object({
  query: z.string().describe('Search query, product name, or product ID to look up'),
  category: z.string().optional().describe('Optional category filter for the product search'),
});

export type ProductInformationInput = z.infer<typeof ProductInformationSchema>;

/**
 * Schema for getting shipping estimates
 */
export const ShippingEstimateSchema = z.object({
  destinationZipCode: z.string().describe('The destination postal or zip code'),
  destinationCountry: z.string().describe('The destination country code (e.g., US, UK, ID)'),
  weightKg: z.number().positive().optional().describe('Optional weight in kilograms'),
});

export type ShippingEstimateInput = z.infer<typeof ShippingEstimateSchema>;

/**
 * Schema for creating a support ticket
 */
export const SupportTicketCreationSchema = z.object({
  issueDescription: z
    .string()
    .min(10)
    .describe('Detailed description of the issue the user is facing'),
  category: z
    .enum(['billing', 'technical', 'shipping', 'general'])
    .describe('The category of the support ticket'),
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .optional()
    .default('medium')
    .describe('The priority level of the ticket'),
});

export type SupportTicketCreationInput = z.infer<typeof SupportTicketCreationSchema>;
