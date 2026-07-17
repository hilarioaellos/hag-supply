import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { authOptions } from "@/lib/auth";

function getSafeCallbackUrl(value: string | string[] | undefined) {
  const redirectValue = Array.isArray(value) ? value[0] : value;
  if (!redirectValue) return "/account";
  if (!redirectValue.startsWith("/") || redirectValue.startsWith("//")) return "/account";
  return redirectValue;
}

function getAuthError(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

interface LoginPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LoginPage(props: LoginPageProps) {
  const session = await getServerSession(authOptions);
  const searchParams = await props.searchParams;
  const callbackUrl = getSafeCallbackUrl(searchParams.redirect);

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-hag-border bg-white p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)]">
        <div className="mb-8 flex flex-col gap-2">
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-hag-text-3">
            HAG Supply
          </span>
          <h1 className="text-3xl font-bold text-hag-text">Sign in to your account</h1>
          <p className="text-sm text-hag-text-2">
            Access checkout, order history, and account tools.
          </p>
        </div>

        <LoginForm callbackUrl={callbackUrl} authError={getAuthError(searchParams.error)} />
      </div>
    </main>
  );
}
