/** State returned by the auth Server Actions to `useActionState`. Never contains the password. */
export type AuthFormState =
  | { status: "idle" }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<"displayName" | "email" | "password", string>>;
    }
  | { status: "check_email"; email: string };

export const IDLE_AUTH_STATE: AuthFormState = { status: "idle" };
