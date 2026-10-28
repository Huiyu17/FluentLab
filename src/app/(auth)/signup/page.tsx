import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Account creation is coming in M2. Explore the app in the meantime."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    />
  );
}
