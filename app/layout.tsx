import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HAG Supply", template: "%s | HAG Supply" },
  description: "Everything for your home — pantry, cleaning, décor, tools and garden.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-hag-bg">{children}</body>
    </html>
  );
}
