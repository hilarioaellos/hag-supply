import Link from "next/link";

interface Props {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}

export function PageLinks({ currentPage, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
  );

  return (
    <div className="flex items-center gap-1">
      {currentPage > 1 && (
        <Link
          href={buildHref(currentPage - 1)}
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
              href={buildHref(page)}
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
          href={buildHref(currentPage + 1)}
          className="px-3 py-1.5 rounded border border-hag-border text-sm text-hag-text hover:bg-hag-bg-alt"
        >
          Next →
        </Link>
      )}
    </div>
  );
}
