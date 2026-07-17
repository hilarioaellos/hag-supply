"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface CategoryFormProps {
  category?: {
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
  };
}

export function CategoryForm({ category }: CategoryFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugModified, setSlugModified] = useState(!!category);

  const [formData, setFormData] = useState({
    name: category?.name || "",
    slug: category?.slug || "",
    imageUrl: category?.imageUrl || "",
  });

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
      slug: !slugModified ? generateSlug(name) : prev.slug,
    }));
  };

  const validateImageUrl = (url: string): string | null => {
    if (!url) return null; // empty is ok
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      const allowed = ["unsplash.com", "pexels.com"];
      if (!allowed.some((domain) => hostname.endsWith(domain))) {
        return `Image URL must be from unsplash.com or pexels.com`;
      }
      return null;
    } catch {
      return "Invalid image URL";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const imageError = validateImageUrl(formData.imageUrl);
    if (imageError) {
      setError(imageError);
      setLoading(false);
      return;
    }

    try {
      const url = category
        ? `/api/admin/categories/${category.id}`
        : "/api/admin/categories";
      const method = category ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save category");
      }

      router.push("/admin/categories");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-[14px]">
          {error}
        </div>
      )}

      <div>
        <label className="block text-[14px] font-semibold text-hag-text mb-2">
          Category Name *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={handleNameChange}
          required
          className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
          placeholder="e.g., Kitchen & Dining"
        />
      </div>

      <div>
        <label className="block text-[14px] font-semibold text-hag-text mb-2">
          Slug * {slugModified && <span className="text-[12px] text-hag-text-2">(auto-generate disabled)</span>}
        </label>
        <input
          type="text"
          value={formData.slug}
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, slug: e.target.value }));
            setSlugModified(true);
          }}
          required
          className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
          placeholder="kitchen-dining"
        />
      </div>

      <div>
        <label className="block text-[14px] font-semibold text-hag-text mb-2">
          Image URL
        </label>
        <input
          type="url"
          value={formData.imageUrl}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, imageUrl: e.target.value }))
          }
          className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
          placeholder="https://images.unsplash.com/... or https://images.pexels.com/..."
        />
        <p className="text-[12px] text-hag-text-2 mt-1">
          Only unsplash.com and pexels.com domains allowed
        </p>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : category ? "Update Category" : "Create Category"}
        </Button>
        <Link href="/admin/categories">
          <Button variant="secondary">Cancel</Button>
        </Link>
      </div>
    </form>
  );
}
