import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/lib/data/categories";
import { SearchBar } from "./SearchBar";
import { CartButton } from "./CartButton";

export async function Header() {
  const categories = await getCategories();

  return (
    <header className="h-[92px] bg-hag-bg border-b border-hag-border flex items-center gap-9 px-12">
      <Link href="/" className="flex-none">
        <Image
          src="/logos/hag-color.svg"
          alt="HAG Supply"
          width={120}
          height={38}
          style={{ height: 38, width: "auto" }}
          priority
        />
      </Link>

      <SearchBar categories={categories} />

      <nav className="flex-none flex gap-7 ml-auto">
        <Link
          href="/account"
          className="flex flex-col items-center gap-0.5 text-hag-text hover:text-hag-accent transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M4 19c0-4 3.5-6.5 7-6.5s7 2.5 7 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
          <span className="text-[11px] font-medium">Account</span>
        </Link>

        <button className="flex flex-col items-center gap-0.5 text-hag-text hover:text-hag-accent transition-colors">
          <span className="text-[20px] leading-none">♡</span>
          <span className="text-[11px] font-medium">Favorites</span>
        </button>

        <CartButton />
      </nav>
    </header>
  );
}
