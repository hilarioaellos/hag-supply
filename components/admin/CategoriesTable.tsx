"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";

interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  productCount: number;
}

export function CategoriesTable({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string, productCount: number) => {
    if (productCount > 0) {
      alert(
        `This category has ${productCount} product${productCount === 1 ? "" : "s"}. Delete or move products first.`
      );
      return;
    }

    if (!confirm("Are you sure? This cannot be undone.")) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting category");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-hag-border">
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Image
            </th>
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Name
            </th>
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Slug
            </th>
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Products
            </th>
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr
              key={cat.id}
              className="border-b border-hag-border hover:bg-hag-bg transition-colors"
            >
              <td className="py-3 px-4">
                {cat.imageUrl ? (
                  <div className="relative w-10 h-10 rounded overflow-hidden">
                    <Image
                      src={cat.imageUrl}
                      alt={cat.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded bg-hag-bg-alt flex items-center justify-center text-[12px] text-hag-text-2">
                    —
                  </div>
                )}
              </td>
              <td className="py-3 px-4">
                <Link
                  href={`/admin/categories/${cat.id}/edit`}
                  className="font-semibold text-hag-accent hover:text-hag-accent-dark"
                >
                  {cat.name}
                </Link>
              </td>
              <td className="py-3 px-4 text-hag-text-2 font-mono text-[12px]">
                {cat.slug}
              </td>
              <td className="py-3 px-4">
                <span className="px-3 py-1 rounded-full text-[12px] font-medium bg-blue-100 text-blue-800">
                  {cat.productCount}
                </span>
              </td>
              <td className="py-3 px-4">
                <div className="flex gap-2">
                  <Link
                    href={`/admin/categories/${cat.id}/edit`}
                    className="text-[12px] px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded transition-colors"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(cat.id, cat.productCount)}
                    disabled={deleting === cat.id || cat.productCount > 0}
                    className={`text-[12px] px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      cat.productCount > 0
                        ? "bg-gray-100 text-gray-400"
                        : "bg-red-100 hover:bg-red-200 text-red-800"
                    }`}
                  >
                    {deleting === cat.id ? "..." : "Delete"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
