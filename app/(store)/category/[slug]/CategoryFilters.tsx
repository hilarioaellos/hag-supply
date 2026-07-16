"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

const BADGE_OPTIONS = [
  { value: "", label: "All" },
  { value: "SALE", label: "On Sale" },
  { value: "NEW", label: "New Arrivals" },
  { value: "BEST_SELLER", label: "Best Sellers" },
];

interface Props {
  currentSort: string;
  currentBadge?: string;
  currentInStock: boolean;
}

export function CategoryFilters({ currentSort, currentBadge, currentInStock }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Sort */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-hag-text-2 mb-3">
          Sort by
        </p>
        <div className="flex flex-col gap-1.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("sort", opt.value)}
              className={`text-left text-[14px] px-3 py-2 rounded-lg transition-colors ${
                currentSort === opt.value
                  ? "bg-hag-accent text-white font-semibold"
                  : "text-hag-text hover:bg-hag-bg-alt"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-hag-border" />

      {/* Badge filter */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-hag-text-2 mb-3">
          Product type
        </p>
        <div className="flex flex-col gap-1.5">
          {BADGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("badge", opt.value)}
              className={`text-left text-[14px] px-3 py-2 rounded-lg transition-colors ${
                (currentBadge ?? "") === opt.value
                  ? "bg-hag-accent text-white font-semibold"
                  : "text-hag-text hover:bg-hag-bg-alt"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-hag-border" />

      {/* In stock */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-hag-text-2 mb-3">
          Availability
        </p>
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <div
            onClick={() => update("inStock", currentInStock ? "" : "true")}
            className={`w-9 h-5 rounded-full relative transition-colors ${
              currentInStock ? "bg-hag-accent" : "bg-hag-border"
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                currentInStock ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-[14px] text-hag-text">In stock only</span>
        </label>
      </div>
    </div>
  );
}
