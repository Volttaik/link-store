/**
 * HeroUI v2 → v3 mechanical renames.
 *
 * Only the changes that carry no semantic risk are automated here:
 *  - CardBody/CardHeader/CardFooter → Card.Content/Card.Header/Card.Footer
 *  - Divider → Separator
 *  - v2 design tokens → the equivalent v3 token (see TOKEN_RENAMES)
 *
 * Everything else (Select, Table, Modal, Dropdown, Tabs, Navbar, Image,
 * Switch, Radio, Textarea, Pagination, Progress) has a different structure in
 * v3 and is migrated by hand, file by file, so the result is real HeroUI usage
 * rather than a rename that only looks migrated.
 *
 * The token table below is derived from HeroUI v3's own theme definition
 * (`@heroui/styles` → `themes/shared/theme.css`), which maps semantic CSS
 * variables onto Tailwind colour utilities. v2's numbered palette
 * (`default-400`, `content1`, `primary`) has no counterpart in v3, so every
 * occurrence is an unstyled class until it is renamed.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const roots = ["app", "components", "lib"];

/** Collect .ts/.tsx files without relying on fs.globSync (Node 22+ only). */
function collect(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collect(full));
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

const files = roots.flatMap((root) => collect(root));

/**
 * v2 token → v3 token, longest patterns first so that e.g. `bg-primary-400`
 * is rewritten before the bare `bg-primary` rule can match its prefix.
 * Each entry is [pattern, replacement] and is applied inside class attributes
 * only, so prose and identifiers are never rewritten.
 */
const TOKEN_RENAMES = [
  // Neutral text ramp: v3 collapses it into a single muted role.
  ["text-default-200", "text-muted"],
  ["text-default-300", "text-muted"],
  ["text-default-400", "text-muted"],
  ["text-default-500", "text-muted"],
  ["text-default-600", "text-foreground"],
  ["text-default-700", "text-foreground"],
  // Surfaces.
  ["bg-content1", "bg-surface"],
  ["bg-content2", "bg-surface-secondary"],
  ["bg-content3", "bg-surface-tertiary"],
  ["bg-content4", "bg-surface-tertiary"],
  ["bg-default-100", "bg-default"],
  ["bg-default-200", "bg-default-hover"],
  // Borders.
  ["border-default-300", "border-border-secondary"],
  ["border-default-400", "border-border"],
  ["border-divider", "border-border"],
  ["divide-divider", "divide-separator"],
  // v2's `primary` is v3's `accent` (Link Store themes --accent monochrome).
  ["bg-primary-400", "bg-accent"],
  ["text-primary", "text-accent"],
  ["bg-primary", "bg-accent"],
  ["border-primary", "border-accent"],
  ["ring-primary", "ring-accent"],
  // Typography and radius scale renames.
  ["text-tiny", "text-xs"],
  ["text-small", "text-sm"],
  ["text-medium", "text-base"],
  ["rounded-small", "rounded-md"],
  ["rounded-medium", "rounded-xl"],
  ["rounded-large", "rounded-2xl"],
];

/**
 * Index of the `>` that closes the tag starting at `start`, skipping any `>`
 * that sits inside a string or a `{…}` expression.
 */
function findTagEnd(source, start) {
  let depth = 0;
  let quote = null;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return index;
  }

  return -1;
}

/**
 * `<Button … as={Link} …>` → `<ButtonLink …>`.
 *
 * v3 buttons are not polymorphic, so a navigating button becomes Link Store's
 * `ButtonLink`, which applies HeroUI's own `buttonVariants()` to a next/link.
 *
 * Openings and closings are paired with a stack over the whole file, so a
 * multi-line attribute list — or a button nested inside another — is handled
 * correctly and nothing outside the pair is touched.
 */
function convertButtonLinks(source) {
  const tokens = [];
  const pattern = /<Button\b|<\/Button>/g;
  let match;

  while ((match = pattern.exec(source))) {
    tokens.push({ start: match.index, text: match[0] });
  }

  const stack = [];
  const edits = [];

  for (const token of tokens) {
    if (token.text === "</Button>") {
      const opening = stack.pop();
      if (opening && opening.convert) {
        edits.push({ start: token.start, end: token.start + 9, text: "</ButtonLink>" });
      }
      continue;
    }

    const openTagEnd = findTagEnd(source, token.start);
    if (openTagEnd === -1) continue;

    const selfClosing = source[openTagEnd - 1] === "/";
    const attributesStart = token.start + "<Button".length;
    const attributesEnd = openTagEnd - (selfClosing ? 1 : 0);
    const attributes = source.slice(attributesStart, attributesEnd);
    const convert = attributes.includes("as={Link}");

    if (convert) {
      edits.push({ start: token.start, end: attributesStart, text: "<ButtonLink" });
      edits.push({
        start: attributesStart,
        end: attributesEnd,
        text: attributes.replace(/\s*as=\{Link\}/g, ""),
      });
    }

    if (!selfClosing) {
      stack.push({ convert });
    }
  }

  if (edits.length === 0) return source;

  let out = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }

  // Make sure the shared helper is imported.
  if (!/import[^;]*\bButtonLink\b[^;]*from "@\/components\/ui\/controls"/.test(out)) {
    const existing = out.match(/import\s*\{([^}]*)\}\s*from "@\/components\/ui\/controls";/);

    if (existing) {
      const names = existing[1]
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      names.push("ButtonLink");
      names.sort((a, b) => a.localeCompare(b));
      out =
        out.slice(0, existing.index) +
        `import { ${names.join(", ")} } from "@/components/ui/controls";` +
        out.slice(existing.index + existing[0].length);
    } else {
      const anchor = out.match(/^import .*\n/m);
      if (anchor) {
        out =
          out.slice(0, anchor.index + anchor[0].length) +
          'import { ButtonLink } from "@/components/ui/controls";\n' +
          out.slice(anchor.index + anchor[0].length);
      }
    }
  }

  return out;
}

/**
 * Collapse duplicated `variant` attributes.
 *
 * These come from v2's two-axis styling: `color` picked the hue while `variant`
 * picked the weight. The v3 rename turned `color="x" variant="y"` into
 * `variant="x" variant="y"`. The v3 variant is the one that was already written
 * by hand, so it is kept and the colour is dropped — except where the colour
 * carried meaning the variant does not, which is a destructive action rendered
 * as a ghost button.
 */
function collapseDuplicateVariants(source) {
  return source.replace(
    /variant="([a-z-]+)"\s+variant="([a-z-]+)"/g,
    (match, color, variant) => (color === "danger" && variant === "ghost" ? 'variant="danger-soft"' : `variant="${variant}"`),
  );
}

/**
 * `<Avatar name={X} src={Y} />` → the v3 compound Avatar.
 *
 * v3 has no `name`/`src` props: the image and its fallback are composed
 * explicitly, so the initials stay visible when a logo is missing or fails.
 * Only the self-closing, prop-based form is rewritten — anything already using
 * `Avatar.Image` is left untouched.
 */
function convertAvatars(source) {
  return source.replace(/<Avatar\b([^>]*?)\/>/g, (match, attributes, offset) => {
    const name = attributes.match(/\bname=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
    if (!name) return match;

    const src = attributes.match(/\bsrc=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
    const size = attributes.match(/\bsize="([a-z]+)"/);
    const className = attributes.match(/\bclassName="([^"]*)"/);

    // Match the indentation the component sat at, so the rewrite stays tidy.
    const lineStart = source.lastIndexOf("\n", offset) + 1;
    const indent = /^[ \t]*/.exec(source.slice(lineStart, offset))[0];
    const inner = indent + "  ";

    const props = [
      size ? `size="${size[1]}"` : null,
      className ? `className="${className[1]}"` : null,
    ]
      .filter(Boolean)
      .join(" ");

    const image = src
      ? `${inner}{${src[1]} ? (\n${inner}  <Avatar.Image alt="" src={${src[1]}} />\n${inner}) : null}\n`
      : "";

    return (
      `<Avatar${props ? ` ${props}` : ""}>\n` +
      image +
      `${inner}<Avatar.Fallback>{${name[1]}}</Avatar.Fallback>\n${indent}</Avatar>`
    );
  });
}

/**
 * Component name → the package subpath that exports it.
 *
 * `@heroui/react`'s barrel is not a client module, but several modules it
 * re-exports reach `client-only` through React Aria. Importing the barrel from a
 * Server Component therefore fails at build time. HeroUI publishes one entry
 * point per component (`@heroui/react/card`) whose graph *is* a client
 * boundary, which is what Server Components must import from.
 */
const SUBPATHS = {
  Accordion: "accordion",
  Alert: "alert",
  AlertDialog: "alert-dialog",
  Avatar: "avatar",
  AvatarGroup: "avatar-group",
  Badge: "badge",
  Breadcrumbs: "breadcrumbs",
  Button: "button",
  ButtonGroup: "button-group",
  Card: "card",
  Checkbox: "checkbox",
  CheckboxGroup: "checkbox-group",
  Chip: "chip",
  CloseButton: "close-button",
  ComboBox: "combo-box",
  Description: "description",
  Disclosure: "disclosure",
  DisclosureGroup: "disclosure-group",
  Drawer: "drawer",
  Dropdown: "dropdown",
  EmptyState: "empty-state",
  ErrorMessage: "error-message",
  FieldError: "field-error",
  Fieldset: "fieldset",
  Form: "form",
  Header: "header",
  Input: "input",
  InputGroup: "input-group",
  InputOTP: "input-otp",
  Kbd: "kbd",
  Label: "label",
  Link: "link",
  ListBox: "list-box",
  Meter: "meter",
  Modal: "modal",
  NumberField: "number-field",
  Pagination: "pagination",
  Popover: "popover",
  ProgressBar: "progress-bar",
  ProgressCircle: "progress-circle",
  Radio: "radio",
  RadioGroup: "radio-group",
  ScrollShadow: "scroll-shadow",
  SearchField: "search-field",
  Select: "select",
  Separator: "separator",
  Skeleton: "skeleton",
  Slider: "slider",
  Spinner: "spinner",
  Surface: "surface",
  Switch: "switch",
  Table: "table",
  Tabs: "tabs",
  Tag: "tag",
  TagGroup: "tag-group",
  TextArea: "textarea",
  TextField: "textfield",
  Toast: "toast",
  Tooltip: "tooltip",
  Typography: "typography",
};

/**
 * Rewrite `@heroui/react` barrel imports as per-component subpath imports, but
 * only in files that are Server Components — a `"use client"` module already
 * establishes the boundary and can keep using the barrel.
 */
function useSubpathImports(source) {
  if (/^\s*("use client"|'use client')/.test(source)) return source;
  if (!source.includes('from "@heroui/react"')) return source;

  const statements = [];
  let changed = false;

  const next = source.replace(
    /import\s*\{([^}]*)\}\s*from "@heroui\/react";/g,
    (match, names) => {
      const groups = new Map();
      const leftovers = [];

      for (const raw of names.split(",")) {
        const entry = raw.trim();
        if (!entry) continue;

        const [imported, alias] = entry.split(/\s+as\s+/).map((part) => part.trim());
        const slug = SUBPATHS[imported];

        if (!slug) {
          leftovers.push(entry);
          continue;
        }

        const binding = alias ? `${imported} as ${alias}` : imported;
        if (!groups.has(slug)) groups.set(slug, []);
        groups.get(slug).push(binding);
      }

      const lines = [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slug, bindings]) => `import { ${bindings.join(", ")} } from "@heroui/react/${slug}";`);

      if (leftovers.length > 0) {
        lines.push(`import { ${leftovers.join(", ")} } from "@heroui/react";`);
      }

      statements.push(lines);
      changed = true;
      return "\u0000HEROUI_IMPORT\u0000";
    },
  );

  if (!changed) return source;

  // Replace the placeholders in order, then drop the blank lines they left.
  let index = 0;
  return next
    .replace(/\u0000HEROUI_IMPORT\u0000/g, () => statements[index++].join("\n"))
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Re-indent the two- and four-line Avatar bodies produced by `convertAvatars`
 * (and any that an earlier run left misaligned) so JSX nests at the offset the
 * component itself sits at. Hand-written Avatars are matched too, but only
 * when their body is exactly this shape.
 */
function reindentConvertedAvatars(source) {
  const generated =
    /^([ \t]*)<Avatar\b([^\n]*?)>\n(?:[ \t]*\{[^\n]*\n[ \t]*<Avatar\.Image[^\n]*\n[ \t]*\) : null\}\n)?[ \t]*<Avatar\.Fallback>[^\n]*<\/Avatar\.Fallback>\n[ \t]*<\/Avatar>/gm;

  return source.replace(generated, (match, indent, attributes) => {
    const lines = match
      .split("\n")
      .slice(1, -1)
      .map((line) => line.trim())
      .filter(Boolean);

    const body = lines.map((line) => `${indent}  ${line}`).join("\n");
    return `${indent}<Avatar${attributes}>\n${body}\n${indent}</Avatar>`;
  });
}

/**
 * Drop attributes that v3 removed from `<Link>` (it has no size scale) and
 * rewrite `<Image>`, which v3 no longer ships, as a plain `<img>`.
 */
function stripRemovedAttributes(source) {
  let out = source
    // <Link size="sm"> → <Link>  (Link direction is expressed by layout, not size)
    .replace(/(<Link\b[^>]*?)\s+size="[a-z]+"/g, "$1")
    // <Image … /> → <img … />  with the v2-only props removed.
    .replace(/<Image\b([\s\S]*?)\/>/g, (match, attributes) => {
      const cleaned = attributes
        .replace(/\s*removeWrapper\b/g, "")
        .replace(/\s*isLoading\b/g, "")
        .replace(/\s*isBlurred\b/g, "")
        .replace(/\s*radius="[a-z]+"/g, "");
      return `<img${cleaned}/>`;
    });

  // Props that only existed on components v3 replaced or simplified.
  out = out.replace(/\s*removeWrapper\b/g, "").replace(/\s*isBordered\b/g, "");

  // The Image import no longer resolves.
  out = out.replace(/import\s*\{([^}]*)\}\s*from "@heroui\/react";/g, (match, names) => {
    const kept = names
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((name) => name !== "Image");
    return kept.length === 0 ? "" : `import { ${kept.join(", ")} } from "@heroui/react";`;
  });

  return out;
}

/** Rewrite v2 tokens inside className/style string literals only. */
function renameTokens(source) {
  return source.replace(
    /(className="[^"]*"|className=\{`[^`]*`\})/g,
    (attribute) => {
      let next = attribute;
      for (const [from, to] of TOKEN_RENAMES) {
        next = next.replace(new RegExp(`${from}(?![-\\w])`, "g"), to);
      }
      return next;
    },
  );
}

let touched = 0;

for (const file of files) {
  const before = readFileSync(file, "utf8");
  let source = before;

  // 1. Compound card parts.
  source = source
    .replace(/<CardBody\b/g, "<Card.Content")
    .replace(/<\/CardBody>/g, "</Card.Content>")
    .replace(/<CardHeader\b/g, "<Card.Header")
    .replace(/<\/CardHeader>/g, "</Card.Header>")
    .replace(/<CardFooter\b/g, "<Card.Footer")
    .replace(/<\/CardFooter>/g, "</Card.Footer>")
    .replace(/<CardBody\s*\/>/g, "<Card.Content />")
    .replace(/<CardHeader\s*\/>/g, "<Card.Header />")
    .replace(/<CardFooter\s*\/>/g, "<Card.Footer />");

  // 2. Divider → Separator (v3 renamed the component).
  source = source.replace(/\bDivider\b/g, "Separator");

  // 3. Drop the now-unused identifiers from the @heroui/react import list.
  source = source.replace(
    /import\s*\{([^}]*)\}\s*from\s*"@heroui\/react";/g,
    (match, names) => {
      const kept = names
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .filter((name) => !["CardBody", "CardHeader", "CardFooter", "Divider"].includes(name));
      if (kept.length === 0) return "";
      return `import { ${kept.join(", ")} } from "@heroui/react";`;
    },
  );

  // 4. Tidy a blank import line if the whole statement was removed.
  source = source.replace(/\nimport\s*;\n/g, "\n");

  // 5. v2 design tokens → v3 tokens.
  source = renameTokens(source);

  // 6. Navigating buttons become ButtonLink (v3 buttons are not polymorphic).
  source = convertButtonLinks(source);

  // 7. Attributes and components removed in v3.
  source = stripRemovedAttributes(source);

  // 8. v2's colour axis collapsed into the v3 variant.
  source = collapseDuplicateVariants(source);

  // 9. Prop-based Avatar → the v3 compound Avatar.
  source = reindentConvertedAvatars(convertAvatars(source));

  // 10. Server Components import HeroUI from per-component subpaths.
  source = useSubpathImports(source);

  if (source !== before) {
    writeFileSync(file, source);
    touched += 1;
    console.log(`updated ${path.relative(process.cwd(), file)}`);
  }
}

console.log(`\n${touched} file(s) updated`);
