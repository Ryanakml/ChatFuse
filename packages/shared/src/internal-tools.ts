// packages/shared/src/internal-tools.ts

export interface InternalOrder {
  id: string;
  external_order_id: string;
  customer_phone: string;
  customer_email?: string;
  status: string;
  payment_status?: string;
  fulfillment_status?: string;
  currency?: string;
  total_amount?: number;
  placed_at?: string; // ISO timestamp
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InternalOrderShipment {
  id: string;
  order_id: string;
  courier_name?: string;
  tracking_number?: string;
  shipping_status?: string;
  estimated_delivery?: string; // ISO timestamp
  shipped_at?: string; // ISO timestamp
  delivered_at?: string; // ISO timestamp
  metadata: Record<string, unknown>;
}

export interface InternalProduct {
  id: string;
  external_product_id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  in_stock: boolean;
  stock_qty?: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InternalShippingRule {
  id: string;
  origin_country: string;
  destination_country: string;
  destination_city?: string;
  weight_min_kg: number;
  weight_max_kg?: number;
  service_level: string;
  courier_name?: string;
  cost: number;
  currency: string;
  estimated_days_min?: number;
  estimated_days_max?: number;
  is_active: boolean;
  created_at: string;
}

// Existing tickets table row (for support ticket creation)
export interface SupportTicket {
  id: string;
  conversation_id: string;
  external_ticket_id?: string;
  status: 'open' | 'pending' | 'closed' | 'escalated';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
