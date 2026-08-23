export const SUPABASE_PAGE_SIZE = 1000;

export async function paginate<T>(
  fetcher: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const page = SUPABASE_PAGE_SIZE;
  const out: T[] = [];
  for (let from = 0; from < 200000; from += page) {
    const { data, error } = await fetcher(from, from + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}
