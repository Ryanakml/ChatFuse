import { getToolsSupabaseClient } from './client.js';

export interface InternalShippingRule {
  id: string;
  origin_country: string;
  destination_country: string;
  destination_city: string | null;
  weight_min_kg: number | string;
  weight_max_kg: number | string | null;
  service_level: string;
  courier_name: string | null;
  cost: number | string;
  currency: string;
  estimated_days_min: number | null;
  estimated_days_max: number | null;
  is_active: boolean;
  created_at: string;
}

const toNumber = (value: number | string | null): number | null => {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export async function getShippingRules(
  destinationCountry: string,
  destinationCity?: string,
  weightKg?: number,
): Promise<InternalShippingRule[]> {
  const supabaseClient = getToolsSupabaseClient();

  const { data, error } = await supabaseClient
    .from('internal_shipping_rules')
    .select(
      `
      id,
      origin_country,
      destination_country,
      destination_city,
      weight_min_kg,
      weight_max_kg,
      service_level,
      courier_name,
      cost,
      currency,
      estimated_days_min,
      estimated_days_max,
      is_active,
      created_at
      `,
    )
    .eq('is_active', true)
    .ilike('destination_country', destinationCountry)
    .order('cost', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch shipping rules: ${error.message}`);
  }

  const normalizedCity = destinationCity?.trim().toLowerCase();

  return ((data ?? []) as InternalShippingRule[]).filter((rule) => {
    const cityMatches =
      !normalizedCity ||
      !rule.destination_city ||
      rule.destination_city.trim().toLowerCase() === normalizedCity;

    if (!cityMatches) {
      return false;
    }

    if (weightKg === undefined) {
      return true;
    }

    const minWeight = toNumber(rule.weight_min_kg);
    const maxWeight = toNumber(rule.weight_max_kg);
    const minOk = minWeight === null ? true : weightKg >= minWeight;
    const maxOk = maxWeight === null ? true : weightKg <= maxWeight;

    return minOk && maxOk;
  });
}
