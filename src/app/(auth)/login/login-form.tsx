"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { sendMagicLink, signIn } from "@/lib/actions/auth";
import { IDLE_AUTH_STATE } from "@/lib/actions/auth-state";
import { AuthAlert, UNCONFIGURED_NOTICE } from "../auth-card";

type Mode = "password" | "link";

export function LoginForm({
  next,
  initialError,
  configured,
}: {
  next: string;
  initialError?: string;
  configured: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialError ? "link" : "password");
  // Controlled so the email survives switching modes and React's post-action form reset.
  const [email, setEmail] = useState("");
  const [passwordState, passwordAction, passwordPending] = useActionState(signIn, IDLE_AUTH_STATE);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, IDLE_AUTH_STATE);

  const state = mode === "password" ? passwordState : linkState;
  const pending = mode === "password" ? passwordPending : linkPending;
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const formError = state.status === "error" ? state.message : undefined;
  const showInitialError = initialError && state.status === "idle";

  return (
    <div className="flex flex-col gap-5">
      {!configured && UNCONFIGURED_NOTICE}
      {showInitialError && <AuthAlert tone="error">{initialError}</AuthAlert>}
      {formError && <AuthAlert tone="error">{formError}</AuthAlert>}
      {mode === "link" && linkState.status === "check_email" && (
        <AuthAlert tone="success">
          If an account exists for <span className="font-medium">{linkState.email}</span>, a sign-in link is
          on its way. Open it on this device.
        </AuthAlert>
      )}

      <form
        action={mode === "password" ? passwordAction : linkAction}
        className="flex flex-col gap-4"
        noValidate
      >
        <input type="hidden" name="next" value={next} />
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
        {mode === "password" && (
          <FormField
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            required
            error={fieldErrors?.password}
          />
        )}
        <Button type="submit" size="lg" disabled={!configured || pending}>
          {mode === "password"
            ? passwordPending
              ? "Signing in…"
              : "Sign in"
            : linkPending
              ? "Sending link…"
              : "Email me a sign-in link"}
        </Button>
      </form>

      <Button
        type="button"
        variant="ghost"
        className="self-center"
        onClick={() => setMode(mode === "password" ? "link" : "password")}
      >
        {mode === "password" ? "Use a sign-in link instead" : "Use my password instead"}
      </Button>
    </div>
  );
}
