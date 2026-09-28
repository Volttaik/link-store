"use client";

/**
 * The type-specific half of the listing form.
 *
 * This component knows nothing about food, garments or flats. It is handed a
 * schema (see `lib/listing-fields.ts`) and renders whatever is in it, grouped in
 * the order the schema declares. So the listing form has **no per-type branches**:
 * adding a field, or an entirely new kind of listing, is a change to the schema
 * and nothing else.
 *
 * Values are a plain `Record<string, unknown>` keyed exactly as the schema's
 * `key`s, which is the shape they are written into `listings.attributes` in. The
 * parent owns that object, so every field here is controlled and nothing is lost
 * when the type changes underneath it.
 */

import { Button } from "@heroui/react";
import { useState } from "react";

import { Field, SelectField, SwitchField, TextAreaField } from "@/components/ui/field";
import { Icon } from "@/components/ui/Icon";
import type { ListingFieldDef, ListingFieldSchema } from "@/lib/listing-fields";
import { minorToInput, parseMoneyToMinor } from "@/lib/money";

/** The option that clears a choice. Never a real value. */
const NONE = "";

export function DynamicListingFields({
  schema,
  values,
  onChange,
  currency,
}: {
  schema: ListingFieldSchema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  currency: string;
}) {
  if (schema.fields.length === 0) return null;

  // Groups in the order the schema first mentions them, so the schema itself
  // decides the reading order rather than the map.
  const groups: Array<{ name: string; fields: ListingFieldDef[] }> = [];
  for (const field of schema.fields) {
    const name = field.group ?? schema.title;
    const existing = groups.find((group) => group.name === name);
    if (existing) existing.fields.push(field);
    else groups.push({ name, fields: [field] });
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div className="flex flex-col gap-5" key={group.name}>
          {groups.length > 1 ? (
            <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">
              {group.name}
            </p>
          ) : null}

          {group.fields.map((field) => (
            <FieldRow
              currency={currency}
              field={field}
              key={field.key}
              value={values[field.key]}
              onChange={(next) => onChange(field.key, next)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  currency,
}: {
  field: ListingFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  currency: string;
}) {
  switch (field.kind) {
    case "longText":
      return (
        <TextAreaField
          description={field.description}
          label={field.label}
          placeholder={field.placeholder}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange(next)}
        />
      );

    case "boolean":
      return (
        <SwitchField
          description={field.description}
          isSelected={value === true}
          onChange={(next) => onChange(next)}
        >
          {field.label}
        </SwitchField>
      );

    case "choice":
      return (
        <SelectField
          description={field.description}
          label={field.label}
          options={[
            { value: NONE, label: "Not set" },
            ...(field.options ?? []),
          ]}
          value={typeof value === "string" ? value : NONE}
          onChange={(next) => onChange(next && next !== NONE ? next : undefined)}
        />
      );

    case "multiChoice":
      return (
        <MultiChoice
          description={field.description}
          label={field.label}
          options={field.options ?? []}
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={onChange}
        />
      );

    case "date":
      return (
        <Field
          description={field.description}
          inputProps={{ type: "date" }}
          label={field.label}
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange(next || undefined)}
        />
      );

    case "money":
      return (
        <MoneyField
          currency={currency}
          description={field.description}
          label={field.label}
          value={typeof value === "number" ? value : null}
          onChange={onChange}
        />
      );

    case "number":
      return (
        <Field
          description={field.description}
          inputProps={{ inputMode: "decimal", min: 0 }}
          label={field.label}
          placeholder={field.placeholder}
          suffix={field.suffix ? <span className="text-muted">{field.suffix}</span> : undefined}
          value={typeof value === "number" || typeof value === "string" ? String(value) : ""}
          onChange={(next) => {
            const trimmed = next.trim();
            onChange(trimmed === "" ? undefined : Number(trimmed));
          }}
        />
      );

    default:
      return (
        <Field
          description={field.description}
          label={field.label}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange(next || undefined)}
        />
      );
  }
}

/**
 * A set of toggles for a value that is a list.
 *
 * Rendered as pressable chips rather than a multi-select because the lists here
 * are short and enumerable (allergens, amenities) and the chosen ones have to be
 * legible at a glance — a closed multi-select hides exactly the information the
 * seller is trying to publish.
 */
function MultiChoice({
  label,
  description,
  options,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const toggle = (option: string) => {
    const next = value.includes(option)
      ? value.filter((entry) => entry !== option)
      : [...value, option];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <Button
              aria-pressed={selected}
              key={option.value}
              size="sm"
              variant={selected ? "primary" : "secondary"}
              onPress={() => toggle(option.value)}
            >
              {selected ? <Icon name="check" size={13} /> : null}
              {option.label}
            </Button>
          );
        })}
      </div>
      {description ? <p className="text-[12.5px] text-muted">{description}</p> : null}
    </div>
  );
}

/**
 * A money field, stored in minor units.
 *
 * The stored value is an integer (`500000` = ₦5,000.00) like every other amount
 * in the platform, but the input keeps its own draft text while it is being
 * typed — otherwise an intermediate `12.` would parse to nothing and be wiped
 * mid-keystroke.
 */
function MoneyField({
  label,
  description,
  value,
  currency,
  onChange,
}: {
  label: string;
  description?: string;
  value: number | null;
  currency: string;
  onChange: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(() => (value === null ? "" : minorToInput(value, currency)));

  return (
    <Field
      description={description}
      inputProps={{ inputMode: "decimal" }}
      label={label}
      prefix={<span className="text-muted">{currency}</span>}
      value={draft}
      onChange={(next) => {
        setDraft(next);
        const minor = parseMoneyToMinor(next, currency);
        onChange(minor === null ? undefined : minor);
      }}
    />
  );
}
