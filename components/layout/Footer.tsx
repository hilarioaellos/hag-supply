import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/lib/data/categories";

export async function Footer() {
  const categories = await getCategories();

  return (
    <footer className="bg-hag-footer text-white/70">
      <div className="px-4 md:px-8 lg:px-12 pt-10 md:pt-14 pb-7">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 pb-10 border-b border-white/10">
          {/* Categories */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Categories</p>
            <ul className="flex flex-col gap-[11px] text-[14px]">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/category/${c.slug}`} className="hover:text-white transition-colors">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Shipping */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Shipping</p>
            <p className="text-[14px] m-0">Ships from Florida, USA</p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center gap-3.5 pt-6">
          <Image src="/logos/hag-blanco.svg" alt="HAG Supply" width={80} height={22} style={{ height: 22, width: "auto", opacity: 0.9 }} />
          <span className="text-[12.5px] text-white/45">© 2026 HAG Supply — A Division of HAG Partner LLC</span>
        </div>
      </div>
    </footer>
  );
}
