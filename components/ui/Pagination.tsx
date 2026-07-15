"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
  );

  return (
    <div className="flex items-center gap-1">
      <button
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
        className="px-3 py-1.5 rounded border border-hag-border text-sm text-hag-text disabled:opacity-40 hover:bg-hag-bg-alt"
      >
        ← Prev
      </button>

      {visible.map((page, i) => {
        const prev = visible[i - 1];
        const gap = prev && page - prev > 1;
        return (
          <span key={page} className="flex items-center gap-1">
            {gap && <span className="px-1 text-hag-text-3">…</span>}
            <button
              onClick={() => onPageChange(page)}
              className={`w-8 h-8 rounded text-sm font-500 ${
                page === currentPage
                  ? "bg-hag-accent text-white"
                  : "border border-hag-border text-hag-text hover:bg-hag-bg-alt"
              }`}
            >
              {page}
            </button>
          </span>
        );
      })}

      <button
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className="px-3 py-1.5 rounded border border-hag-border text-sm text-hag-text disabled:opacity-40 hover:bg-hag-bg-alt"
      >
        Next →
      </button>
    </div>
  );
}
