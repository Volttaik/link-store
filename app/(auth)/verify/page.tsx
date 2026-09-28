import { redirect } from "next/navigation";

import { AuthLanding } from "@/components/auth/AuthLanding";
import { getCurrentUser } from "@/lib/auth";
import { isGoogleEnabled } from "@/lib/auth/server";

export const metadata = { title: "Enter your code" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string; purpose?: string; sent?: string }>;
}) {
  const params = await searchParams;
  const email = (params.email ?? "").trim().toLowerCase();

  // Without an address there is no code to check, and the screen would be a dead
  // end — send them back to the start instead.
  if (!email) redirect("/sign-in");

  if (await getCurrentUser()) redirect("/auth/continue");

  const purpose = params.purpose === "email-verification" ? "email-verification" : "sign-in";

  return (
    <AuthLanding
      googleEnabled={isGoogleEnabled}
      next={params.next ?? ""}
      step={{
        kind: "code",
        email,
        purpose,
        notice: `We sent a six-digit code to ${email}.`,
        back: purpose === "email-verification" ? "sign-up" : "sign-in",
      }}
    />
  );
}
