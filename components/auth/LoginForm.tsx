"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface LoginFormProps {
  callbackUrl: string;
  authError?: string;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Invalid email or password.",
  Default: "Unable to sign in right now. Try again in a moment.",
};

function getErrorMessage(error?: string) {
  if (!error) return null;
  return AUTH_ERROR_MESSAGES[error] ?? AUTH_ERROR_MESSAGES.Default;
}

export function LoginForm({ callbackUrl, authError }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(getErrorMessage(authError));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setSubmitting(false);

    if (!result) {
      setFormError(AUTH_ERROR_MESSAGES.Default);
      return;
    }

    if (result.error) {
      setFormError(getErrorMessage(result.error) ?? AUTH_ERROR_MESSAGES.Default);
      return;
    }

    router.push(result.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {formError ? <Alert variant="error">{formError}</Alert> : null}

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      <Button type="submit" size="lg" loading={submitting}>
        Sign In
      </Button>

      <p className="text-center text-sm text-hag-text-2">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-hag-accent hover:text-hag-accent-dark transition-colors">
          Create account
        </Link>
      </p>
    </form>
  );
}
