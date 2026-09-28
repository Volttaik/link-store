"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { lookupOrderAction, type LookupState } from "@/app/actions/orders";

export function OrderLookupForm() {
  const [state, formAction] = useActionState<LookupState, FormData>(lookupOrderAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field isRequired label="Email" name="email" placeholder="you@example.com" type="email" />
        <Field
          isRequired
          description="Shown on your receipt and confirmation page."
          label="Order number"
          name="orderNumber"
          placeholder="LS-26-ABC123"
        />
      </div>

      {state?.error ? (
        <p className="text-xs text-danger" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton variant="primary">Find my order</SubmitButton>
    </form>
  );
}
