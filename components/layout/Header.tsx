import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/lib/data/categories";
import { SearchBar } from "./SearchBar";
import { CartButton } from "./CartButton";

export async function Header() {
  const categories = await getCategories();

  return (
    <header className="bg-hag-bg border-b border-hag-border">
      <div className="px-4 md:px-12 py-3 md:py-0 md:h-[108px] flex flex-col md:flex-row md:items-center gap-3 md:gap-9">

        {/* Row 1 on mobile: logo + compact icons */}
        <div className="flex items-center">
          <Link href="/" className="flex-none">
            <Image
              src="/logos/hag-color.svg"
              alt="HAG Supply"
              width={180}
              height={57}
              style={{ height: 44, width: "auto" }}
              priority
            />
          </Link>

          {/* Mobile-only: account + cart */}
          <div className="flex items-center gap-5 ml-auto md:hidden">
            <Link href="/account" className="text-hag-text hover:text-hag-accent transition-colors" aria-label="Account">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4 19c0-4 3.5-6.5 7-6.5s7 2.5 7 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
              </svg>
            </Link>
            <CartButton />
          </div>
        </div>

        {/* Search bar — full width on mobile, flex-1 on desktop */}
        <SearchBar categories={categories} />

        {/* Desktop-only: full nav */}
        <nav className="hidden md:flex flex-none gap-7 ml-auto">
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
      </div>
    </header>
  );
}
