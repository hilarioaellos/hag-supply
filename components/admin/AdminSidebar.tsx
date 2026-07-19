"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export function AdminSidebar() {
  const pathname = usePathname();

  const navItems = [
    { href: "/admin", label: "Dashboard", icon: "📊" },
    { href: "/admin/products", label: "Products", icon: "📦" },
    { href: "/admin/categories", label: "Categories", icon: "🏷️" },
    { href: "/admin/orders", label: "Orders", icon: "📋" },
    { href: "/admin/users", label: "Users", icon: "👥" },
  ];

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-[240px] bg-white border-r border-hag-border flex flex-col">
      <div className="px-6 py-8 border-b border-hag-border flex items-center gap-2">
        <div className="text-[24px]">🏢</div>
        <span className="font-bold text-hag-text">HAG Admin</span>
      </div>

      <nav className="flex-1 px-4 py-6 flex flex-col gap-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-3 rounded-lg text-[14px] font-medium transition-colors flex items-center gap-3 ${
              isActive(item.href)
                ? "bg-hag-accent text-white"
                : "text-hag-text hover:bg-hag-bg"
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-6 border-t border-hag-border">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full px-4 py-2 rounded-lg text-[14px] font-medium text-hag-text hover:bg-hag-bg transition-colors text-left"
        >
          🚪 Sign Out
        </button>
      </div>
    </aside>
  );
}
