/** Shared display helpers used across multiple pages. */

export type CustomerSummary = {
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

/** Returns the best display name for a customer or lead-like record. */
export function formatCustomerName(record: CustomerSummary | null | undefined): string {
  if (!record) return "—";
  const fullName = [record.first_name, record.last_name].filter(Boolean).join(" ");
  return (record.company_name ?? fullName) || "—";
}

/**
 * Given a project whose `.customers` field may be a single record or an array
 * (Supabase join can return either), returns the first matching customer summary.
 */
export function customerRecordFromJoin(
  customers: CustomerSummary | CustomerSummary[] | null | undefined
): CustomerSummary | null {
  if (!customers) return null;
  return Array.isArray(customers) ? (customers[0] ?? null) : customers;
}

/** Convenience: extract and format customer name from a Supabase join result. */
export function formatJoinedCustomerName(
  customers: CustomerSummary | CustomerSummary[] | null | undefined
): string {
  return formatCustomerName(customerRecordFromJoin(customers));
}
