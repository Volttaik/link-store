import { redirect } from "next/navigation";

import { AuthLanding } from "@/components/auth/AuthLanding";
import { getCurrentUser, postAuthDestination } from "@/lib/auth";
import { isGoogleEnabled } from "@/lib/auth/server";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  const user = await getCurrentUser();
  if (user) {
    redirect(await postAuthDestination(user.id, params.next ?? null));
  }

  return (
    <AuthLanding
      googleEnabled={isGoogleEnabled}
      next={params.next ?? ""}
      step={{ kind: "sign-up" }}
    />
  );
}
