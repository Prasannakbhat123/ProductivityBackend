export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function toPaginatedResult<T>(items: T[], total: number, page: number, limit: number): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { items, total, page, limit, totalPages };
}

export function parsePagination(limitRaw: unknown, pageRaw: unknown, defaultLimit = 25, maxLimit = 500) {
  const limit = Math.min(Math.max(Number(limitRaw ?? defaultLimit) || defaultLimit, 1), maxLimit);
  const page = Math.max(Number(pageRaw ?? 1) || 1, 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
