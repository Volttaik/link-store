import { ResetPasswordFlow } from "@/components/auth/PasswordResetFlow";

export const metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

/**
 * Setting a new password from a reset link.
 *
 * The link carries a single-use token; the engine consumes it the moment the
 * password is set, so a link that was already used — or that expired waiting
 * in an inbox — arrives here and is refused with the state that says so, not
 * with a blank form that will fail on submit.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  // The engine's own callback reports a dead link as `?error=INVALID_TOKEN`.
  const linkInvalid = params.error === "INVALID_TOKEN";

  return (
    <div className="w-full max-w-sm">
      <ResetPasswordFlow linkInvalid={linkInvalid} token={token} />
    </div>
  );
}
