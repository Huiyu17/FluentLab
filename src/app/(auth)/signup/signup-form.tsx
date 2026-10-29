"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { signUp } from "@/lib/actions/auth";
import { IDLE_AUTH_STATE } from "@/lib/actions/auth-state";
import { AuthAlert, UNCONFIGURED_NOTICE } from "../auth-card";

export function SignupForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(signUp, IDLE_AUTH_STATE);
  // Controlled so values survive React's post-action form reset when validation fails.
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  if (state.status === "check_email") {
    return (
      <AuthAlert tone="success">
        <p>
          Check your inbox. We sent a confirmation link to <span className="font-medium">{state.email}</span>.
          Open it on this device to finish setting up.
        </p>
      </AuthAlert>
    );
  }

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const formError = state.status === "error" ? state.message : undefined;

  return (
    <div className="flex flex-col gap-5">
      {!configured && UNCONFIGURED_NOTICE}
      {formError && <AuthAlert tone="error">{formError}</AuthAlert>}

      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormField
          id="displayName"
          name="displayName"
          label="What should we call you?"
          autoComplete="nickname"
          required
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={fieldErrors?.displayName}
        />
        <FormField
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors?.email}
        />
        <FormField
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          error={fieldErrors?.password}
        />
        <Button type="submit" size="lg" disabled={!configured || pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
