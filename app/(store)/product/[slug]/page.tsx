import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getProduct, getRelatedProducts } from "@/lib/data/products";
import { Badge } from "@/components/ui/Badge";
import { ProductCard } from "@/components/product/ProductCard";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { QuantitySelector } from "./QuantitySelector";

interface Props {
  params: Promise<{ slug: string }>;
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="none">
            {i < full ? (
              <polygon
                points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                fill="var(--color-hag-star)"
              />
            ) : i === full && half ? (
              <>
                <defs>
                  <linearGradient id={`half-${i}`}>
                    <stop offset="50%" stopColor="var(--color-hag-star)" />
                    <stop offset="50%" stopColor="var(--color-hag-border)" />
                  </linearGradient>
                </defs>
                <polygon
                  points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                  fill={`url(#half-${i})`}
                />
              </>
            ) : (
              <polygon
                points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                fill="var(--color-hag-border)"
              />
            )}
          </svg>
        ))}
      </div>
      <span className="text-[14px] font-semibold text-hag-text">{rating}</span>
      <span className="text-[14px] text-hag-text-2">({count} reviews)</span>
    </div>
  );
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product.category.slug, slug);

  const price = parseFloat(product.price);
  const comparePrice = product.comparePrice ? parseFloat(product.comparePrice) : null;
  const discount = comparePrice
    ? Math.round(((comparePrice - price) / comparePrice) * 100)
    : null;
  const mainImage = product.imageUrls[0] ?? null;
  const extraImages = product.imageUrls.slice(1);

  return (
    <div className="min-h-screen bg-hag-bg">
      {/* Breadcrumb */}
      <div className="px-12 py-4 border-b border-hag-border">
        <nav className="flex items-center gap-1.5 text-[13px] text-hag-text-2">
          <Link href="/" className="hover:text-hag-accent transition-colors">Home</Link>
          <span className="text-hag-border">/</span>
          <Link
            href={`/category/${product.category.slug}`}
            className="hover:text-hag-accent transition-colors"
          >
            {product.category.name}
          </Link>
          <span className="text-hag-border">/</span>
          <span className="text-hag-text font-medium line-clamp-1">{product.name}</span>
        </nav>
      </div>

      {/* Main product section */}
      <div className="px-12 py-10">
        <div className="grid grid-cols-[1fr_1fr] gap-16 max-w-[1100px]">
          {/* Images */}
          <div className="flex gap-3">
            {/* Thumbnail strip */}
            {extraImages.length > 0 && (
              <div className="flex flex-col gap-2 w-[72px] shrink-0">
                {product.imageUrls.map((url, i) => (
                  <div
                    key={i}
                    className={`relative h-[72px] rounded-lg overflow-hidden border-2 ${
                      i === 0 ? "border-hag-accent" : "border-hag-border"
                    }`}
                  >
                    <Image src={url} alt={`${product.name} ${i + 1}`} fill className="object-cover" sizes="72px" />
                  </div>
                ))}
              </div>
            )}

            {/* Main image */}
            <div className="flex-1 relative aspect-square rounded-2xl overflow-hidden bg-hag-bg-alt border border-hag-border">
              {mainImage ? (
                <Image
                  src={mainImage}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1200px) 50vw, 540px"
                  priority
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{
                    background:
                      "repeating-linear-gradient(45deg, var(--color-hag-border), var(--color-hag-border) 10px, var(--color-hag-bg-alt) 10px, var(--color-hag-bg-alt) 20px)",
                  }}
                >
                  <span className="font-mono text-[13px] text-hag-text-2 bg-hag-bg px-3 py-1.5 rounded border border-hag-border">
                    No image
                  </span>
                </div>
              )}

              {/* Badge overlay */}
              {product.badge && (
                <div className="absolute top-4 left-4">
                  <Badge variant={product.badge} />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col gap-5">
            {/* SKU */}
            {product.sku && (
              <p className="text-[12px] text-hag-text-3 font-mono">SKU: {product.sku}</p>
            )}

            {/* Name */}
            <h1 className="text-[28px] font-bold text-hag-text leading-snug">{product.name}</h1>

            {/* Rating — decorativo en MVP */}
            <StarRating rating={4.2} count={127} />

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-[32px] font-extrabold text-hag-text">${price.toFixed(2)}</span>
              {comparePrice && (
                <>
                  <span className="text-[18px] text-hag-text-3 line-through">${comparePrice.toFixed(2)}</span>
                  <span className="text-[13px] font-bold text-hag-sale bg-hag-sale/10 px-2 py-0.5 rounded">
                    -{discount}%
                  </span>
                </>
              )}
            </div>

            {/* Stock status */}
            <div className="flex items-center gap-2">
              {product.stock > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-[13px] font-medium text-green-700">
                    In stock
                    {product.stock <= 10 && (
                      <span className="text-hag-sale ml-1">— only {product.stock} left</span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-hag-border" />
                  <span className="text-[13px] font-medium text-hag-text-3">Out of stock</span>
                </>
              )}
            </div>

            <div className="border-t border-hag-border" />

            {/* Quantity + Add to Cart */}
            <QuantitySelector productId={product.id} stock={product.stock} />

            {/* Description */}
            <div className="border-t border-hag-border pt-5">
              <p className="text-[13px] font-bold uppercase tracking-wider text-hag-text-2 mb-2">
                Description
              </p>
              <p className="text-[15px] text-hag-text-2 leading-relaxed">{product.description}</p>
            </div>

            {/* Trust badges */}
            <div className="flex gap-4 pt-1">
              {[
                { icon: "🚚", label: "Free shipping over $50" },
                { icon: "🔒", label: "Secure checkout" },
                { icon: "↩️", label: "30-day returns" },
              ].map((b) => (
                <div key={b.label} className="flex items-center gap-1.5 text-[12px] text-hag-text-2">
                  <span>{b.icon}</span>
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Related Products */}
        {related.length > 0 && (
          <div className="mt-16 pt-10 border-t border-hag-border">
            <div className="flex items-baseline justify-between mb-7">
              <h2 className="text-[22px] font-bold text-hag-text">More from {product.category.name}</h2>
              <Link
                href={`/category/${product.category.slug}`}
                className="text-[14px] font-semibold text-hag-accent-dark hover:text-hag-accent transition-colors"
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-5">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
