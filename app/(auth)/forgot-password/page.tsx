import { ForgotPasswordFlow } from "@/components/auth/PasswordResetFlow";

export const metadata = { title: "Reset your password" };
export const dynamic = "force-dynamic";

/**
 * Asking for a reset link.
 *
 * Open to anyone, signed in or not: the request itself reveals nothing about
 * who has an account, and the link that arrives is single-use and expires in
 * an hour. The card does the whole journey — ask, sending, check your email.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-sm">
      <ForgotPasswordFlow />
    </div>
  );
}
