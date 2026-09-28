import { redirect } from "next/navigation";

import { AuthLanding } from "@/components/auth/AuthLanding";
import { getCurrentUser, postAuthDestination } from "@/lib/auth";
import { isGoogleEnabled } from "@/lib/auth/server";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; error?: string; reason?: string }>;
}) {
  const params = await searchParams;

  // Already signed in: there is nothing to sign in to. Where they go is where
  // they were headed, or the marketplace home — never forced into onboarding.
  const user = await getCurrentUser();
  if (user) {
    redirect(await postAuthDestination(user.id, params.next ?? null));
  }

  return (
    <AuthLanding
      googleEnabled={isGoogleEnabled}
      next={params.next ?? ""}
      step={{ kind: "sign-in" }}
    />
  );
}
