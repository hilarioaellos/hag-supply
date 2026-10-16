import Link from "next/link";
import { HELP_LINKS, LEGAL_LINKS, STORE_INFO } from "@/lib/store-info";

// Plantilla común de las páginas de ayuda y legales: título, fecha de vigencia, índice lateral y cuerpo.
export function PolicyPage({
  title,
  intro,
  current,
  showUpdated = true,
  children,
}: {
  title: string;
  intro?: string;
  current: string;
  showUpdated?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-hag-bg">
      <div className="px-4 md:px-8 lg:px-12 py-8 md:py-12 max-w-[1100px] mx-auto grid md:grid-cols-[200px_1fr] gap-8 md:gap-12">
        <nav aria-label="Help and policies" className="md:sticky md:top-6 self-start">
          <ul className="flex md:flex-col flex-wrap gap-x-4 gap-y-2 text-[14px]">
            {[...HELP_LINKS, ...LEGAL_LINKS].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={l.href === current ? "page" : undefined}
                  className={l.href === current ? "font-semibold text-hag-accent" : "text-hag-text-2 hover:text-hag-text"}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0">
          <h1 className="text-[28px] md:text-[34px] font-extrabold text-hag-text leading-tight">{title}</h1>
          {showUpdated && <p className="text-[13px] text-hag-text-3 mt-2">Last updated: {STORE_INFO.policiesUpdated}</p>}
          {intro && <p className="text-[16px] text-hag-text-2 mt-4 max-w-[68ch]">{intro}</p>}
          <div className="mt-8 max-w-[68ch]">{children}</div>
        </article>
      </div>
    </div>
  );
}

export function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[18px] font-bold text-hag-text mb-3">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-hag-text-2">{children}</div>
    </section>
  );
}

export function ContactLine() {
  return (
    <a href={`mailto:${STORE_INFO.email}`} className="text-hag-accent hover:underline">
      {STORE_INFO.email}
    </a>
  );
}
