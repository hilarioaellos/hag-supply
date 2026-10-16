import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/lib/data/categories";
import { HELP_LINKS, LEGAL_LINKS, STORE_INFO } from "@/lib/store-info";

export async function Footer() {
  const categories = await getCategories();

  return (
    <footer className="bg-hag-footer text-white/70">
      <div className="px-4 md:px-8 lg:px-12 pt-10 md:pt-14 pb-7">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-10 border-b border-white/10">
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

          {/* Help (contacto y políticas, requisito de Stripe) */}
          <FooterLinks title="Help" links={HELP_LINKS} />

          {/* Legal */}
          <FooterLinks title="Legal" links={LEGAL_LINKS} />

          {/* Shipping */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Shipping</p>
            <p className="text-[14px] m-0">Free shipping. Ships from Florida, USA</p>
            <a href={`mailto:${STORE_INFO.email}`} className="block text-[14px] mt-3 hover:text-white transition-colors">
              {STORE_INFO.email}
            </a>
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

function FooterLinks({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">{title}</p>
      <ul className="flex flex-col gap-[11px] text-[14px]">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:text-white transition-colors">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
