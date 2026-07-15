import Image from "next/image";
import Link from "next/link";

const CATEGORIES = [
  { name: "Home and Kitchen", slug: "home-and-kitchen" },
  { name: "Cleaning Supplies", slug: "cleaning-supplies" },
  { name: "Tools and Hardware", slug: "tools-and-hardware" },
  { name: "Patio and Garden", slug: "patio-and-garden" },
  { name: "Pet Supplies", slug: "pet-supplies" },
  { name: "Deals & Offers", slug: "/deals" },
];

const HELP = ["Track Your Order", "Shipping Info", "Returns & Exchanges", "FAQs"];
const POLICIES = ["Privacy Policy", "Terms of Service", "Accessibility"];

export function Footer() {
  return (
    <footer className="bg-hag-footer text-white/70">
      <div className="px-12 pt-14 pb-7">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1.3fr] gap-8 pb-10 border-b border-white/10">
          {/* Categories */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Categories</p>
            <ul className="flex flex-col gap-[11px] text-[14px]">
              {CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <Link href={c.slug.startsWith("/") ? c.slug : `/category/${c.slug}`} className="hover:text-white transition-colors">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Help */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Help</p>
            <ul className="flex flex-col gap-[11px] text-[14px]">
              {HELP.map((item) => (
                <li key={item}><span className="hover:text-white transition-colors cursor-pointer">{item}</span></li>
              ))}
            </ul>
          </div>

          {/* Policies */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Policies</p>
            <ul className="flex flex-col gap-[11px] text-[14px]">
              {POLICIES.map((item) => (
                <li key={item}><span className="hover:text-white transition-colors cursor-pointer">{item}</span></li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Contact</p>
            <ul className="flex flex-col gap-[11px] text-[14px]">
              <li>1-800-555-0134</li>
              <li>support@hagsupply.com</li>
              <li>Mon–Fri, 8am–7pm ET</li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Newsletter</p>
            <p className="text-[13.5px] mb-3.5 leading-relaxed">Get weekly deals and new arrivals in your inbox.</p>
            <div className="flex border border-white/25 rounded-lg overflow-hidden">
              <input
                placeholder="Email address"
                className="flex-1 border-none bg-transparent text-white px-3 py-[11px] text-[13px] outline-none placeholder:text-white/40"
              />
              <button className="bg-hag-accent text-white border-none px-4 text-[13px] font-bold hover:bg-hag-accent-dark transition-colors">
                Sign Up
              </button>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between pt-6">
          <div className="flex items-center gap-3.5">
            <Image src="/logos/hag-blanco.svg" alt="HAG Supply" width={80} height={22} style={{ height: 22, width: "auto", opacity: 0.9 }} />
            <span className="text-[12.5px] text-white/45">© 2026 HAG Supply — A Division of HAG Partner LLC</span>
          </div>
          <div className="flex gap-2.5">
            {["f", "ig", "in", "x"].map((icon) => (
              <div key={icon} className="w-[30px] h-[30px] rounded-full border border-white/25 flex items-center justify-center text-[12px] font-semibold hover:border-white/50 transition-colors cursor-pointer">
                {icon}
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
