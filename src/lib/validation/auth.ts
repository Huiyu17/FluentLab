import { z } from "zod";

export const EmailSchema = z
  .string({ error: "Enter your email." })
  .trim()
  .toLowerCase()
  .min(1, { error: "Enter your email." })
  .max(254, { error: "That email is too long." })
  .pipe(z.email({ error: "Enter a valid email address." }));

// Supabase's own minimum is configurable (default 6); we require 8 in the app.
// bcrypt (used by Supabase Auth) limits passwords to 72 *bytes*, not characters.
const PasswordSchema = z
  .string({ error: "Enter a password." })
  .min(8, { error: "Use at least 8 characters." })
  .refine((v) => new TextEncoder().encode(v).length <= 72, {
    error: "That password is too long. Use 72 characters or fewer (fewer if it has non-English letters).",
  });

export const SignUpSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: "Tell us what to call you." })
    .max(80, { error: "Use 80 characters or fewer." }),
  email: EmailSchema,
  password: PasswordSchema,
});

export const SignInSchema = z.object({
  email: EmailSchema,
  password: z.string({ error: "Enter your password." }).min(1, { error: "Enter your password." }).max(72),
});

export const MagicLinkSchema = z.object({ email: EmailSchema });

export const EMAIL_OTP_TYPES = [
  "signup",
  "magiclink",
  "email",
  "recovery",
  "email_change",
  "invite",
] as const;
export const EmailOtpTypeSchema = z.enum(EMAIL_OTP_TYPES);
