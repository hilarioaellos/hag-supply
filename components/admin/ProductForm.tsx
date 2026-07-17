"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface ProductFormProps {
  product?: {
    id: string;
    name: string;
    slug: string;
    description: string;
    sku: string | null;
    price: string;
    comparePrice: string | null;
    stock: number;
    imageUrls: string[];
    badge: string | null;
    categoryId: string;
  };
  categories: { id: string; name: string }[];
}

export function ProductForm({ product, categories }: ProductFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugModified, setSlugModified] = useState(!!product); // true if editing

  const [formData, setFormData] = useState({
    name: product?.name || "",
    slug: product?.slug || "",
    description: product?.description || "",
    sku: product?.sku || "",
    price: product?.price || "",
    comparePrice: product?.comparePrice || "",
    stock: product?.stock?.toString() || "",
    imageUrls: product?.imageUrls?.join("\n") || "",
    badge: product?.badge || "",
    categoryId: product?.categoryId || "",
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
      // Solo auto-regenera slug si no fue editado manualmente (new product o slug no tocado)
      slug: !slugModified ? generateSlug(name) : prev.slug,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const imageUrls = formData.imageUrls
        .split("\n")
        .filter((url) => url.trim());

      const payload = {
        ...formData,
        imageUrls,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock),
        comparePrice: formData.comparePrice
          ? parseFloat(formData.comparePrice)
          : null,
      };

      const url = product
        ? `/api/admin/products/${product.id}`
        : "/api/admin/products";
      const method = product ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save product");
      }

      router.push("/admin/products");
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
          Product Name *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={handleNameChange}
          required
          className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
          placeholder="e.g., Chef's Knife 8-inch"
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
          placeholder="chefs-knife-8-inch"
        />
      </div>

      <div>
        <label className="block text-[14px] font-semibold text-hag-text mb-2">
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
          className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
          rows={4}
          placeholder="Describe the product..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[14px] font-semibold text-hag-text mb-2">
            SKU
          </label>
          <input
            type="text"
            value={formData.sku}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, sku: e.target.value }))
            }
            className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
            placeholder="SKU-001"
          />
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-hag-text mb-2">
            Category *
          </label>
          <select
            value={formData.categoryId}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, categoryId: e.target.value }))
            }
            required
            className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-[14px] font-semibold text-hag-text mb-2">
            Price *
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, price: e.target.value }))
            }
            required
            className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-hag-text mb-2">
            Compare Price
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.comparePrice}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                comparePrice: e.target.value,
              }))
            }
            className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-hag-text mb-2">
            Stock *
          </label>
          <input
            type="number"
            value={formData.stock}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, stock: e.target.value }))
            }
            required
            className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <label className="block text-[14px] font-semibold text-hag-text mb-2">
          Badge
        </label>
        <select
          value={formData.badge}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, badge: e.target.value }))
          }
          className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
        >
          <option value="">No badge</option>
          <option value="SALE">Sale</option>
          <option value="BEST_SELLER">Best Seller</option>
          <option value="NEW">New</option>
        </select>
      </div>

      <div>
        <label className="block text-[14px] font-semibold text-hag-text mb-2">
          Image URLs (one per line)
        </label>
        <textarea
          value={formData.imageUrls}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, imageUrls: e.target.value }))
          }
          className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent font-mono text-[12px]"
          rows={4}
          placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : product ? "Update Product" : "Create Product"}
        </Button>
        <Link href="/admin/products">
          <Button variant="secondary">Cancel</Button>
        </Link>
      </div>
    </form>
  );
}
