import { getToolsSupabaseClient } from './client.js';

export interface InternalProduct {
  id: string;
  external_product_id: string;
  name: string;
  description: string | null;
  price: number | string;
  currency: string;
  category: string | null;
  in_stock: boolean;
  stock_qty: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function searchProducts(
  query: string,
  category?: string,
  limit: number = DEFAULT_LIMIT,
): Promise<InternalProduct[]> {
  const supabaseClient = getToolsSupabaseClient();
  const boundedLimit = Math.max(1, Math.min(limit, MAX_LIMIT));
  const escapedQuery = query.replaceAll(',', '\\,');
  const pattern = `%${escapedQuery}%`;

  let dbQuery = supabaseClient
    .from('internal_products')
    .select(
      `
      id,
      external_product_id,
      name,
      description,
      price,
      currency,
      category,
      in_stock,
      stock_qty,
      metadata,
      created_at,
      updated_at
      `,
    )
    .or(`name.ilike.${pattern},description.ilike.${pattern}`)
    .order('name', { ascending: true })
    .limit(boundedLimit);

  if (category) {
    dbQuery = dbQuery.eq('category', category);
  }

  const { data, error } = await dbQuery;

  if (error) {
    throw new Error(`Failed to search products: ${error.message}`);
  }

  return (data ?? []) as InternalProduct[];
}
