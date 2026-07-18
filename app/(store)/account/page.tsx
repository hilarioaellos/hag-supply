"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === "loading") return null;

  if (!session?.user) {
    router.push("/login?redirect=/account");
    return null;
  }

  return (
    <div className="min-h-screen bg-hag-bg">
      <div className="px-12 py-10 max-w-[1100px] mx-auto">
        <h1 className="text-[28px] font-bold text-hag-text mb-8">My Account</h1>

        <div className="bg-white border border-hag-border rounded-2xl p-8 max-w-[500px]">
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-hag-text-2 font-semibold uppercase tracking-wide">Name</p>
              <p className="text-[18px] font-semibold text-hag-text mt-2">{session.user.name || "Not set"}</p>
            </div>

            <div>
              <p className="text-[13px] text-hag-text-2 font-semibold uppercase tracking-wide">Email</p>
              <p className="text-[18px] font-semibold text-hag-text mt-2">{session.user.email}</p>
            </div>

            <div className="pt-4 border-t border-hag-border flex flex-col gap-3">
              <Link href="/account/orders" className="block">
                <Button className="w-full">View Order History</Button>
              </Link>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
