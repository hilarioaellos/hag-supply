import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ProductBadge } from "@prisma/client";

export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  price: string;
  comparePrice?: string | null;
  imageUrls: string[];
  badge?: ProductBadge | null;
  stock: number;
}

function StarRating() {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[12px] text-hag-star">★★★★</span>
      <span className="text-[12px] text-hag-border">★</span>
      <span className="text-[12px] text-hag-text-3">(—)</span>
    </div>
  );
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const img = product.imageUrls[0] ?? "/placeholder-product.svg";
  const price = parseFloat(product.price);
  const comparePrice = product.comparePrice ? parseFloat(product.comparePrice) : null;

  return (
    <div className="bg-hag-bg border border-hag-border rounded-[10px] p-3.5 flex flex-col gap-2 relative">
      {product.badge && (
        <div className="absolute top-[22px] left-[22px] z-10">
          <Badge variant={product.badge} />
        </div>
      )}

      <Link href={`/product/${product.slug}`} className="block">
        <div className="relative h-[150px] rounded-lg overflow-hidden bg-hag-bg-alt">
          <Image
            src={img}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 200px"
          />
        </div>
      </Link>

      <Link
        href={`/product/${product.slug}`}
        className="text-[14px] font-semibold text-hag-text leading-snug hover:text-hag-accent transition-colors line-clamp-2"
      >
        {product.name}
      </Link>

      <StarRating />

      <div className="flex items-baseline gap-2">
        <span className="text-[17px] font-bold text-hag-text">${price.toFixed(2)}</span>
        {comparePrice && (
          <span className="text-[13px] text-hag-text-3 line-through">${comparePrice.toFixed(2)}</span>
        )}
      </div>

      {product.stock === 0 ? (
        <button
          disabled
          className="mt-1 w-full py-2.5 rounded-[7px] text-[13px] font-semibold bg-hag-bg-alt text-hag-text-3 cursor-not-allowed"
        >
          Out of Stock
        </button>
      ) : (
        <Link
          href={`/product/${product.slug}`}
          className="mt-1 w-full py-2.5 rounded-[7px] text-[13px] font-semibold bg-hag-accent text-white text-center hover:bg-hag-accent-dark transition-colors"
        >
          Add to Cart
        </Link>
      )}
    </div>
  );
}
