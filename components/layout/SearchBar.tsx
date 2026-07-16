"use client";

import { useState, FormEvent, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SearchBarProps {
  categories: { name: string; slug: string }[];
}

export function SearchBar({ categories }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const params = new URLSearchParams({ q: query.trim() });
    if (selectedCategory) params.set("category", selectedCategory);
    router.push(`/search?${params.toString()}`);
  }

  const categoryLabel = selectedCategory
    ? categories.find((c) => c.slug === selectedCategory)?.name ?? "All Categories"
    : "All Categories";

  return (
    <form
      onSubmit={submit}
      className="flex-1 max-w-[660px] h-[46px] border-[1.5px] border-hag-border rounded-lg flex items-center bg-hag-bg-alt overflow-hidden"
    >
      <div className="relative flex-none" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-1.5 px-4 h-[46px] border-r border-hag-border text-hag-text-2 text-[13px] font-medium whitespace-nowrap hover:bg-hag-bg-alt transition-colors"
        >
          {categoryLabel}
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
            <polyline points="4,7 10,13 16,7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-hag-bg border border-hag-border rounded-lg shadow-lg z-50 py-1">
            <button
              type="button"
              onClick={() => { setSelectedCategory(""); setDropdownOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-hag-text hover:bg-hag-bg-alt"
            >
              All Categories
            </button>
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => { setSelectedCategory(c.slug); setDropdownOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-hag-text hover:bg-hag-bg-alt"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products, brands, and categories"
        className="flex-1 border-none outline-none bg-transparent text-[14px] text-hag-text px-4 placeholder:text-hag-text-3"
      />

      <button
        type="submit"
        className="flex-none h-full w-14 bg-hag-accent text-white flex items-center justify-center hover:bg-hag-accent-dark transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
          <line x1="14" y1="14" x2="18.5" y2="18.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}
