"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

interface Category {
  name: string;
  slug: string;
  imageUrl: string | null;
}

interface Props {
  q: string;
  category?: string;
  categories: Category[];
}

export function SearchFilters({ q, category, categories }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const term = String(data.get("q") || "").trim();
    const cat = String(data.get("category") || "");
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (cat) params.set("category", cat);
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 max-w-[720px]">
      <input
        ref={inputRef}
        name="q"
        defaultValue={q}
        placeholder="Search products, brands, and categories…"
        autoFocus
        className="flex-1 h-11 px-4 rounded-lg border border-hag-border bg-hag-bg text-[14px] text-hag-text placeholder:text-hag-text-3 focus:outline-none focus:ring-2 focus:ring-hag-accent"
      />
      <select
        name="category"
        defaultValue={category ?? ""}
        className="h-11 px-3 rounded-lg border border-hag-border bg-hag-bg text-[14px] text-hag-text focus:outline-none focus:ring-2 focus:ring-hag-accent"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-11 px-5 rounded-lg bg-hag-accent text-white text-[14px] font-semibold hover:bg-hag-accent-dark transition-colors"
      >
        Search
      </button>
    </form>
  );
}
