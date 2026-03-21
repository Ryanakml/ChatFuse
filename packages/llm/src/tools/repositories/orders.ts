import { getToolsSupabaseClient } from './client.js';
import { buildIndonesianPhoneLookupCandidates } from '@wa-chat/shared';

export interface InternalOrderShipment {
  id: string;
  order_id: string;
  courier_name: string | null;
  tracking_number: string | null;
  shipping_status: string | null;
  estimated_delivery: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  metadata: Record<string, unknown>;
}

export interface InternalOrder {
  id: string;
  external_order_id: string;
  customer_phone: string;
  customer_email: string | null;
  status: string;
  payment_status: string | null;
  fulfillment_status: string | null;
  currency: string | null;
  total_amount: number | string | null;
  placed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrderWithShipments {
  order: InternalOrder;
  shipments: InternalOrderShipment[];
}

interface InternalOrderWithJoin extends InternalOrder {
  internal_order_shipments: InternalOrderShipment[] | null;
}

export async function lookupOrderByPhone(
  customerPhone: string,
  externalOrderId?: string,
): Promise<OrderWithShipments | null> {
  const supabaseClient = getToolsSupabaseClient();
  const phoneCandidates = buildIndonesianPhoneLookupCandidates(customerPhone);
  const fallbackPhone = customerPhone.trim();
  const lookupValues =
    phoneCandidates.length > 0
      ? phoneCandidates
      : fallbackPhone
        ? [fallbackPhone]
        : [];

  if (lookupValues.length === 0) {
    return null;
  }

  let query = supabaseClient
    .from('internal_orders')
    .select(
      `
      id,
      external_order_id,
      customer_phone,
      customer_email,
      status,
      payment_status,
      fulfillment_status,
      currency,
      total_amount,
      placed_at,
      metadata,
      created_at,
      updated_at,
      internal_order_shipments (
        id,
        order_id,
        courier_name,
        tracking_number,
        shipping_status,
        estimated_delivery,
        shipped_at,
        delivered_at,
        metadata
      )
      `,
    )
    .in('customer_phone', lookupValues)
    .order('placed_at', { ascending: false })
    .limit(1);

  if (externalOrderId) {
    query = query.eq('external_order_id', externalOrderId);
  }

  const { data, error } = await query.maybeSingle<InternalOrderWithJoin>();

  if (error) {
    throw new Error(`Failed to lookup order by phone: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const { internal_order_shipments: shipments, ...order } = data;

  return {
    order,
    shipments: shipments ?? [],
  };
}
