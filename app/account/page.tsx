import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { authOptions } from "@/lib/auth";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?redirect=/account");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 px-4 py-12">
      <section className="w-full rounded-[28px] border border-hag-border bg-white p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)]">
        <div className="flex flex-col gap-3 border-b border-hag-border pb-6">
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-hag-text-3">
            Account
          </span>
          <h1 className="text-3xl font-bold text-hag-text">
            {session.user.name || session.user.email}
          </h1>
          <p className="text-sm text-hag-text-2">{session.user.email}</p>
        </div>

        <dl className="grid gap-4 py-6 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-hag-bg-alt p-4">
            <dt className="text-hag-text-3">Role</dt>
            <dd className="mt-2 text-base font-semibold text-hag-text">{session.user.role}</dd>
          </div>
          <div className="rounded-2xl bg-hag-bg-alt p-4">
            <dt className="text-hag-text-3">Session</dt>
            <dd className="mt-2 text-base font-semibold text-hag-text">Active</dd>
          </div>
        </dl>

        <SignOutButton />
      </section>
    </main>
  );
}
