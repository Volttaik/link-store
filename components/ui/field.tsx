"use client";

/**
 * Link Store form fields.
 *
 * HeroUI v3 splits what v2 called `Input` into a primitive (`Input`) plus a
 * composer (`TextField` → `Label` / `Input` / `Description` / `FieldError`), and
 * turns `Select` and `Switch` into compound components. Every screen in Link
 * Store needs that same composition, so it is expressed once here.
 *
 * These wrappers add no styling of their own — they only arrange HeroUI's own
 * components in the order HeroUI documents. Behaviour, states, spacing, radii
 * and theming all come from HeroUI, so a field looks and behaves identically
 * wherever it appears.
 */

import { Description, FieldError, Input, InputGroup, Label, ListBox, Select, Switch, TextArea, TextField } from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/Icon";

/** Shared shape for anything that renders a list of choices. */
export type FieldOption = {
  value: string;
  label: string;
  /** Optional secondary line shown under the label inside the listbox. */
  description?: string;
  /** Optional leading icon, named from the Link Store icon set. */
  icon?: IconName;
  disabled?: boolean;
};

type FieldBaseProps = {
  label: string;
  /** Helper text shown under the control until the field is invalid. */
  description?: ReactNode;
  /** Message shown when the value is rejected. Presence marks the field invalid. */
  error?: string | null;
};

/**
 * A select can legitimately be labelled by something other than visible text
 * (a quantity column, a toolbar), so its label is optional and the caller
 * supplies `aria-label` instead.
 */
type SelectBaseProps = Omit<FieldBaseProps, "label"> & { label?: string };

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  description,
  error,
  placeholder,
  prefix,
  suffix,
  className,
  inputClassName,
  inputProps,
  ...textFieldProps
}: FieldBaseProps & {
  placeholder?: string;
  className?: string;
  /** Rendered inside `InputGroup.Prefix` when supplied. */
  prefix?: ReactNode;
  /** Rendered inside `InputGroup.Suffix` when supplied. */
  suffix?: ReactNode;
  inputClassName?: string;
  /**
   * Props that belong to the `<input>` element itself rather than the field —
   * `min`, `max`, `step`, `inputMode`, `autoComplete` and so on. HeroUI splits
   * these across `TextField` and `Input`, so they are forwarded explicitly.
   */
  inputProps?: ComponentProps<typeof Input>;
} & Omit<ComponentProps<typeof TextField>, "children" | "className">) {
  const invalid = Boolean(error) || Boolean(textFieldProps.isInvalid);

  return (
    <TextField {...textFieldProps} className={className} isInvalid={invalid}>
      <Label>{label}</Label>

      {prefix || suffix ? (
        <InputGroup>
          {prefix ? <InputGroup.Prefix>{prefix}</InputGroup.Prefix> : null}
          <InputGroup.Input
            {...inputProps}
            className={inputClassName}
            placeholder={placeholder}
          />
          {suffix ? <InputGroup.Suffix>{suffix}</InputGroup.Suffix> : null}
        </InputGroup>
      ) : (
        <Input {...inputProps} className={inputClassName} placeholder={placeholder} />
      )}

      {description ? <Description>{description}</Description> : null}
      <FieldError>{error ?? undefined}</FieldError>
    </TextField>
  );
}

/* -------------------------------------------------------------------------- */
/* Multiline text                                                             */
/* -------------------------------------------------------------------------- */

export function TextAreaField({
  label,
  description,
  error,
  placeholder,
  className,
  textAreaClassName,
  inputProps,
  rows,
  ...textFieldProps
}: FieldBaseProps & {
  placeholder?: string;
  className?: string;
  rows?: number;
  textAreaClassName?: string;
  inputProps?: ComponentProps<typeof TextArea>;
} & Omit<ComponentProps<typeof TextField>, "children" | "className">) {
  const invalid = Boolean(error) || Boolean(textFieldProps.isInvalid);

  return (
    <TextField {...textFieldProps} className={className} isInvalid={invalid}>
      <Label>{label}</Label>
      <TextArea
        {...inputProps}
        className={textAreaClassName}
        placeholder={placeholder}
        rows={rows}
      />
      {description ? <Description>{description}</Description> : null}
      <FieldError>{error ?? undefined}</FieldError>
    </TextField>
  );
}

/* -------------------------------------------------------------------------- */
/* Select                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A select whose value is a plain string.
 *
 * HeroUI v3's `Select` is react-aria's, so it is driven by `selectedKey` and
 * `onSelectionChange` — *not* by `value`/`onChange`. Passing the familiar pair
 * through to it compiled (both names exist on the underlying div's prop types)
 * but did nothing at runtime: the value never bound, and choosing an option
 * fired an event nobody was listening for. That is what made every category,
 * type and status selector in the platform open but never take a selection.
 *
 * So the translation happens here, once, and every call site keeps the simple
 * string-in / string-out API. Fixing it in one place is the whole point: there
 * is exactly one implementation of "choose a value from a list" for the
 * marketplace, the workspace and the admin to share.
 */
export function SelectField({
  label,
  description,
  error,
  placeholder = "Select an item",
  options,
  className,
  value,
  onChange,
  ...selectProps
}: SelectBaseProps & {
  options: readonly FieldOption[];
  placeholder?: string;
  className?: string;
  /** The selected option's value. `null`/empty shows the placeholder. */
  value?: string | null;
  /** Called with the chosen value, or `null` when the selection is cleared. */
  onChange?: (value: string | null) => void;
} & Omit<
  ComponentProps<typeof Select>,
  "children" | "className" | "placeholder" | "value" | "onChange" | "selectedKey" | "onSelectionChange"
>) {
  const invalid = Boolean(error) || Boolean(selectProps.isInvalid);

  // `undefined` and `""` both mean "nothing chosen"; react-aria wants `null` for
  // the placeholder, and any other value must match an item's `id` exactly.
  const selectedKey = value === undefined || value === null || value === "" ? null : value;

  return (
    <Select
      {...selectProps}
      className={className}
      isInvalid={invalid}
      placeholder={placeholder}
      selectedKey={selectedKey}
      onSelectionChange={(key) => onChange?.(key === null ? null : String(key))}
    >
      {label ? <Label>{label}</Label> : null}

      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>

      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              id={option.value}
              key={option.value}
              textValue={option.label}
              isDisabled={option.disabled}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  {option.icon ? <Icon name={option.icon} /> : null}
                  {option.label}
                </span>
                {option.description ? (
                  <span className="text-xs text-muted">{option.description}</span>
                ) : null}
              </span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>

      {description ? <Description>{description}</Description> : null}
      <FieldError>{error ?? undefined}</FieldError>
    </Select>
  );
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                     */
/* -------------------------------------------------------------------------- */

export function SwitchField({
  children,
  description,
  className,
  ...switchProps
}: {
  /** Omit only when the control carries its own `aria-label`. */
  children?: ReactNode;
  description?: ReactNode;
  className?: string;
} & Omit<ComponentProps<typeof Switch>, "children" | "className">) {
  return (
    <Switch {...switchProps} className={className}>
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        {children ?? null}
      </Switch.Content>
      {description ? <Description>{description}</Description> : null}
    </Switch>
  );
}
