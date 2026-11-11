import type { PostgrestError } from "@supabase/supabase-js";

export async function pageAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data) throw new Error("Paginated response missing");
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
