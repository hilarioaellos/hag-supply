"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: string;
  stock: number;
  badge: string | null;
  deletedAt: string | null;
  category: { name: string };
}

export function ProductsTable({ products }: { products: Product[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure? This cannot be undone.")) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");
      router.refresh();
    } catch (err) {
      alert("Error deleting product");
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
              Name
            </th>
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Category
            </th>
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Price
            </th>
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Stock
            </th>
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Badge
            </th>
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Status
            </th>
            <th className="text-left py-3 px-4 font-semibold text-hag-text-2">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr
              key={product.id}
              className="border-b border-hag-border hover:bg-hag-bg transition-colors"
            >
              <td className="py-3 px-4">
                <Link
                  href={`/admin/products/${product.id}/edit`}
                  className="font-semibold text-hag-accent hover:text-hag-accent-dark"
                >
                  {product.name}
                </Link>
              </td>
              <td className="py-3 px-4 text-hag-text-2">
                {product.category.name}
              </td>
              <td className="py-3 px-4 font-semibold text-hag-text">
                ${parseFloat(product.price).toFixed(2)}
              </td>
              <td className="py-3 px-4">
                <span
                  className={`px-3 py-1 rounded-full text-[12px] font-medium ${
                    product.stock > 0
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {product.stock} units
                </span>
              </td>
              <td className="py-3 px-4 text-hag-text-2">
                {product.badge || "-"}
              </td>
              <td className="py-3 px-4">
                <span
                  className={`px-3 py-1 rounded-full text-[12px] font-medium ${
                    product.deletedAt
                      ? "bg-gray-100 text-gray-800"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  {product.deletedAt ? "Deleted" : "Active"}
                </span>
              </td>
              <td className="py-3 px-4">
                <div className="flex gap-2">
                  <Link
                    href={`/admin/products/${product.id}/edit`}
                    className="text-[12px] px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded transition-colors"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(product.id)}
                    disabled={deleting === product.id}
                    className="text-[12px] px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded transition-colors disabled:opacity-50"
                  >
                    {deleting === product.id ? "..." : "Delete"}
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
