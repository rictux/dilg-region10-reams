const DEFAULT_PAGE_SIZE = 1000;

export const fetchAllSupabaseRows = async <T>(
  createQuery: () => any,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<T[]> => {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await createQuery().range(from, to);

    if (error) throw error;

    const page = (data || []) as T[];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};
