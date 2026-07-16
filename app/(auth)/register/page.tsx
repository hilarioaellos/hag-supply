import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/account");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-hag-border bg-white p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)]">
        <div className="mb-8 flex flex-col gap-2">
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-hag-text-3">
            HAG Supply
          </span>
          <h1 className="text-3xl font-bold text-hag-text">Create your account</h1>
          <p className="text-sm text-hag-text-2">
            Start shopping — fast delivery, thousands of products.
          </p>
        </div>

        <RegisterForm />

        <p className="mt-6 text-center text-sm text-hag-text-2">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-hag-accent hover:text-hag-accent-dark transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
