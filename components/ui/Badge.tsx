import { ProductBadge } from "@prisma/client";

const styles: Record<ProductBadge, string> = {
  SALE: "bg-hag-sale text-white",
  BEST_SELLER: "bg-hag-accent text-white",
  NEW: "bg-emerald-500 text-white",
};

const labels: Record<ProductBadge, string> = {
  SALE: "Sale",
  BEST_SELLER: "Best Seller",
  NEW: "New",
};

export function Badge({ variant }: { variant: ProductBadge }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-700 ${styles[variant]}`}>
      {labels[variant]}
    </span>
  );
}
