import Link from "next/link";
import { getCategories } from "@/lib/data/categories";

export async function CategoryNav() {
  const categories = await getCategories();

  return (
    <nav className="h-[46px] bg-hag-bg border-b border-hag-border flex items-center gap-[30px] px-12 text-[14px] font-medium text-hag-text overflow-x-auto scrollbar-none">
      {categories.map((cat) => (
        <Link
          key={cat.slug}
          href={`/category/${cat.slug}`}
          className="whitespace-nowrap hover:text-hag-accent transition-colors"
        >
          {cat.name}
        </Link>
      ))}
      <Link
        href="/deals"
        className="whitespace-nowrap font-bold text-hag-accent-dark hover:text-hag-accent transition-colors"
      >
        Deals &amp; Offers
      </Link>
    </nav>
  );
}
