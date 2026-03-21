import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFromDotEnv(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function assertRequiredEnvVars(keys: string[]): void {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

type SeedOrder = {
  external_order_id: string;
  customer_phone: string;
  customer_email: string;
  status: 'processing' | 'shipped' | 'delivered';
  payment_status: 'paid';
  fulfillment_status: 'picking' | 'in_transit' | 'completed';
  currency: 'USD';
  total_amount: number;
  placed_at: string;
  metadata: Record<string, unknown>;
  shipment: {
    courier_name: 'JNE' | 'SiCepat' | 'Anteraja';
    tracking_number: string;
    shipping_status: 'ready_to_ship' | 'in_transit' | 'delivered';
    estimated_delivery: string;
    shipped_at: string | null;
    delivered_at: string | null;
    metadata: Record<string, unknown>;
  };
};

const seedOrders: SeedOrder[] = [
  {
    external_order_id: 'ORD-ID-20260321-001',
    customer_phone: '+628129990001',
    customer_email: 'budi.santoso@example.id',
    status: 'processing',
    payment_status: 'paid',
    fulfillment_status: 'picking',
    currency: 'USD',
    total_amount: 179.0,
    placed_at: '2026-03-21T02:10:00.000Z',
    metadata: {
      seed_tag: 'internal-tool-seed-v1',
      customer_name: 'Budi Santoso',
      channel: 'whatsapp',
    },
    shipment: {
      courier_name: 'JNE',
      tracking_number: 'JNEID2603210001',
      shipping_status: 'ready_to_ship',
      estimated_delivery: '2026-03-24T09:00:00.000Z',
      shipped_at: null,
      delivered_at: null,
      metadata: {
        seed_tag: 'internal-tool-seed-v1',
        service_level: 'standard',
      },
    },
  },
  {
    external_order_id: 'ORD-ID-20260320-002',
    customer_phone: '+628139990002',
    customer_email: 'sari.rahma@example.id',
    status: 'shipped',
    payment_status: 'paid',
    fulfillment_status: 'in_transit',
    currency: 'USD',
    total_amount: 249.0,
    placed_at: '2026-03-20T04:45:00.000Z',
    metadata: {
      seed_tag: 'internal-tool-seed-v1',
      customer_name: 'Sari Rahma',
      channel: 'whatsapp',
    },
    shipment: {
      courier_name: 'SiCepat',
      tracking_number: 'SICEPATID2603200002',
      shipping_status: 'in_transit',
      estimated_delivery: '2026-03-22T10:00:00.000Z',
      shipped_at: '2026-03-20T09:30:00.000Z',
      delivered_at: null,
      metadata: {
        seed_tag: 'internal-tool-seed-v1',
        service_level: 'express',
      },
    },
  },
  {
    external_order_id: 'ORD-ID-20260318-003',
    customer_phone: '+628579990003',
    customer_email: 'andi.pratama@example.id',
    status: 'delivered',
    payment_status: 'paid',
    fulfillment_status: 'completed',
    currency: 'USD',
    total_amount: 89.5,
    placed_at: '2026-03-18T01:20:00.000Z',
    metadata: {
      seed_tag: 'internal-tool-seed-v1',
      customer_name: 'Andi Pratama',
      channel: 'whatsapp',
    },
    shipment: {
      courier_name: 'Anteraja',
      tracking_number: 'ANTERAJAID2603180003',
      shipping_status: 'delivered',
      estimated_delivery: '2026-03-20T08:00:00.000Z',
      shipped_at: '2026-03-18T06:10:00.000Z',
      delivered_at: '2026-03-19T15:40:00.000Z',
      metadata: {
        seed_tag: 'internal-tool-seed-v1',
        service_level: 'standard',
      },
    },
  },
];

const seedProducts = [
  {
    external_product_id: 'PRD-ELEC-001',
    name: 'Wireless Earbuds Pro',
    description: 'True wireless earbuds with ANC, 30-hour battery, and USB-C fast charging.',
    price: 79.99,
    currency: 'USD',
    category: 'electronics',
    in_stock: true,
    stock_qty: 120,
    metadata: { seed_tag: 'internal-tool-seed-v1', brand: 'SOUNDMAX' },
  },
  {
    external_product_id: 'PRD-ELEC-002',
    name: 'Smart Home Camera 2K',
    description: 'Indoor smart camera with 2K video, motion alerts, and night vision.',
    price: 64.5,
    currency: 'USD',
    category: 'electronics',
    in_stock: false,
    stock_qty: 0,
    metadata: { seed_tag: 'internal-tool-seed-v1', brand: 'HOMEWATCH' },
  },
  {
    external_product_id: 'PRD-ELEC-003',
    name: 'Portable Bluetooth Speaker Mini',
    description: 'Compact splash-resistant speaker with rich bass and 12-hour playtime.',
    price: 39.0,
    currency: 'USD',
    category: 'electronics',
    in_stock: true,
    stock_qty: 75,
    metadata: { seed_tag: 'internal-tool-seed-v1', brand: 'BEATBOX' },
  },
  {
    external_product_id: 'PRD-ACC-001',
    name: 'USB-C Fast Charging Cable 2m',
    description: 'Durable braided cable for 100W PD charging and high-speed data transfer.',
    price: 12.99,
    currency: 'USD',
    category: 'accessories',
    in_stock: true,
    stock_qty: 300,
    metadata: { seed_tag: 'internal-tool-seed-v1', brand: 'POWERLINE' },
  },
  {
    external_product_id: 'PRD-ACC-002',
    name: 'Laptop Sleeve 14-inch',
    description: 'Water-resistant padded sleeve with soft interior and accessory pocket.',
    price: 24.75,
    currency: 'USD',
    category: 'accessories',
    in_stock: false,
    stock_qty: 0,
    metadata: { seed_tag: 'internal-tool-seed-v1', brand: 'CITYGEAR' },
  },
];

const seedShippingRules = [
  {
    origin_country: 'ID',
    destination_country: 'ID',
    destination_city: 'Jakarta',
    weight_min_kg: 0,
    weight_max_kg: 1,
    service_level: 'standard',
    courier_name: 'JNE',
    cost: 3.5,
    currency: 'USD',
    estimated_days_min: 2,
    estimated_days_max: 3,
    is_active: true,
  },
  {
    origin_country: 'ID',
    destination_country: 'ID',
    destination_city: 'Jakarta',
    weight_min_kg: 0,
    weight_max_kg: 1,
    service_level: 'express',
    courier_name: 'SiCepat',
    cost: 5.8,
    currency: 'USD',
    estimated_days_min: 1,
    estimated_days_max: 2,
    is_active: true,
  },
  {
    origin_country: 'ID',
    destination_country: 'ID',
    destination_city: 'Surabaya',
    weight_min_kg: 0,
    weight_max_kg: 1,
    service_level: 'standard',
    courier_name: 'Anteraja',
    cost: 4.2,
    currency: 'USD',
    estimated_days_min: 2,
    estimated_days_max: 4,
    is_active: true,
  },
  {
    origin_country: 'ID',
    destination_country: 'ID',
    destination_city: 'Surabaya',
    weight_min_kg: 0,
    weight_max_kg: 1,
    service_level: 'express',
    courier_name: 'JNE',
    cost: 6.4,
    currency: 'USD',
    estimated_days_min: 1,
    estimated_days_max: 2,
    is_active: true,
  },
  {
    origin_country: 'ID',
    destination_country: 'ID',
    destination_city: 'Bandung',
    weight_min_kg: 0,
    weight_max_kg: 1,
    service_level: 'standard',
    courier_name: 'SiCepat',
    cost: 3.8,
    currency: 'USD',
    estimated_days_min: 2,
    estimated_days_max: 3,
    is_active: true,
  },
  {
    origin_country: 'ID',
    destination_country: 'ID',
    destination_city: 'Bandung',
    weight_min_kg: 0,
    weight_max_kg: 1,
    service_level: 'express',
    courier_name: 'Anteraja',
    cost: 5.9,
    currency: 'USD',
    estimated_days_min: 1,
    estimated_days_max: 2,
    is_active: true,
  },
];

async function seedInternalToolData(): Promise<void> {
  loadEnvFromDotEnv(path.resolve(process.cwd(), '.env'));
  assertRequiredEnvVars(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);

  const supabase = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      auth: { persistSession: false },
    },
  );

  let ordersUpserted = 0;
  let shipmentsInserted = 0;
  let productsUpserted = 0;
  let shippingRulesInserted = 0;

  const { data: upsertedOrders, error: ordersError } = await supabase
    .from('internal_orders')
    .upsert(
      seedOrders.map((order) => ({
        external_order_id: order.external_order_id,
        customer_phone: order.customer_phone,
        customer_email: order.customer_email,
        status: order.status,
        payment_status: order.payment_status,
        fulfillment_status: order.fulfillment_status,
        currency: order.currency,
        total_amount: order.total_amount,
        placed_at: order.placed_at,
        metadata: order.metadata,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'external_order_id', ignoreDuplicates: false },
    )
    .select('id, external_order_id');

  if (ordersError) {
    throw new Error(`Failed to upsert internal orders: ${ordersError.message}`);
  }

  const orderIdByExternalId = new Map<string, string>();
  for (const row of upsertedOrders ?? []) {
    const externalOrderId = row.external_order_id as string | undefined;
    const orderId = row.id as string | undefined;
    if (externalOrderId && orderId) {
      orderIdByExternalId.set(externalOrderId, orderId);
    }
  }
  ordersUpserted = seedOrders.length;

  const seededOrderIds = Array.from(orderIdByExternalId.values());
  if (seededOrderIds.length > 0) {
    const { error: deleteShipmentsError } = await supabase
      .from('internal_order_shipments')
      .delete()
      .in('order_id', seededOrderIds);

    if (deleteShipmentsError) {
      throw new Error(`Failed to clear existing order shipments: ${deleteShipmentsError.message}`);
    }
  }

  const shipmentRows = seedOrders
    .map((order) => {
      const orderId = orderIdByExternalId.get(order.external_order_id);
      if (!orderId) {
        return null;
      }

      return {
        order_id: orderId,
        courier_name: order.shipment.courier_name,
        tracking_number: order.shipment.tracking_number,
        shipping_status: order.shipment.shipping_status,
        estimated_delivery: order.shipment.estimated_delivery,
        shipped_at: order.shipment.shipped_at,
        delivered_at: order.shipment.delivered_at,
        metadata: order.shipment.metadata,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (shipmentRows.length > 0) {
    const { error: shipmentsError } = await supabase
      .from('internal_order_shipments')
      .insert(shipmentRows);

    if (shipmentsError) {
      throw new Error(`Failed to insert order shipments: ${shipmentsError.message}`);
    }

    shipmentsInserted = shipmentRows.length;
  }

  const { error: productsError } = await supabase
    .from('internal_products')
    .upsert(
      seedProducts.map((product) => ({
        ...product,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'external_product_id', ignoreDuplicates: false },
    );

  if (productsError) {
    throw new Error(`Failed to upsert internal products: ${productsError.message}`);
  }
  productsUpserted = seedProducts.length;

  const { error: deleteRulesError } = await supabase
    .from('internal_shipping_rules')
    .delete()
    .eq('origin_country', 'ID')
    .eq('destination_country', 'ID')
    .in('destination_city', ['Jakarta', 'Surabaya', 'Bandung']);

  if (deleteRulesError) {
    throw new Error(`Failed to clear existing shipping rules: ${deleteRulesError.message}`);
  }

  const { error: shippingRulesError } = await supabase
    .from('internal_shipping_rules')
    .insert(seedShippingRules);

  if (shippingRulesError) {
    throw new Error(`Failed to insert shipping rules: ${shippingRulesError.message}`);
  }
  shippingRulesInserted = seedShippingRules.length;

  console.log(
    [
      `Internal tool seed completed:`,
      `orders upserted=${ordersUpserted}`,
      `shipments inserted=${shipmentsInserted}`,
      `products upserted=${productsUpserted}`,
      `shipping rules inserted=${shippingRulesInserted}`,
    ].join(' '),
  );
}

seedInternalToolData().catch((error) => {
  console.error('Internal tool data seed failed:', error);
  process.exit(1);
});

