import Link from "next/link";

interface Props {
  currentPage: number;
  totalPages: number;
  slug: string;
  searchParams: Record<string, string | string[] | undefined>;
}

function buildUrl(
  slug: string,
  searchParams: Record<string, string | string[] | undefined>,
  page: number
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k !== "page" && v) params.set(k, String(v));
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/category/${slug}${qs ? `?${qs}` : ""}`;
}

export function CategoryPagination({ currentPage, totalPages, slug, searchParams }: Props) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
  );

  return (
    <div className="flex items-center gap-1">
      {currentPage > 1 && (
        <Link
          href={buildUrl(slug, searchParams, currentPage - 1)}
          className="px-3 py-1.5 rounded border border-hag-border text-sm text-hag-text hover:bg-hag-bg-alt"
        >
          ← Prev
        </Link>
      )}

      {visible.map((page, i) => {
        const prev = visible[i - 1];
        const gap = prev && page - prev > 1;
        return (
          <span key={page} className="flex items-center gap-1">
            {gap && <span className="px-1 text-hag-text-3">…</span>}
            <Link
              href={buildUrl(slug, searchParams, page)}
              className={`w-8 h-8 flex items-center justify-center rounded text-sm ${
                page === currentPage
                  ? "bg-hag-accent text-white font-semibold"
                  : "border border-hag-border text-hag-text hover:bg-hag-bg-alt"
              }`}
            >
              {page}
            </Link>
          </span>
        );
      })}

      {currentPage < totalPages && (
        <Link
          href={buildUrl(slug, searchParams, currentPage + 1)}
          className="px-3 py-1.5 rounded border border-hag-border text-sm text-hag-text hover:bg-hag-bg-alt"
        >
          Next →
        </Link>
      )}
    </div>
  );
}
