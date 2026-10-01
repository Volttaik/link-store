"use client";

import { Button } from "@heroui/react";
import { useState } from "react";
import { ListingForm, type ListingFormProps } from "./ListingForm";

export function ProductCreation(props: ListingFormProps) {
  const [forms, setForms] = useState([0]);
  return <div className="space-y-8">
    {forms.map((id, index) => <section key={id} aria-label={`Product ${index + 1}`} className="space-y-3">
      {forms.length > 1 ? <h2 className="text-lg font-semibold">Product {index + 1}</h2> : null}
      <ListingForm {...props} stayOnPage />
    </section>)}
    <Button type="button" variant="secondary" onPress={() => setForms(previous => [...previous, previous.length])}>Add another product</Button>
  </div>;
}
