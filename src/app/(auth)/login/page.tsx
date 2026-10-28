import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Email + password and magic-link sign-in are coming in M2."
      footer={
        <>
          New to FluentLab?{" "}
          <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    />
  );
}
