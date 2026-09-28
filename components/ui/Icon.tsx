/**
 * The LINK STORE icon set.
 *
 * HeroUI's own components and documentation use `@gravity-ui/icons`, so Link
 * Store uses the same library — one consistent, monochrome, 16px-grid icon
 * language across the marketplace, the storefront and the workspace.
 *
 * Icons are referenced by semantic name everywhere else in the app, so a
 * concept ("orders") maps to one icon no matter which component draws it, and
 * no emoji is ever used as interface iconography.
 */

import {
  ArrowDownRight,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowRightFromSquare,
  ArrowUpFromLine,
  ArrowUpFromSquare,
  ArrowUpRight,
  ArrowUpRightFromSquare,
  ArrowRotateRight,
  ChartBar,
  Bars,
  Bell,
  Box,
  Boxes3,
  Calendar,
  Car,
  CaretsExpandVertical,
  ChartLine,
  ChartPie,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDollar,
  CircleInfo,
  CircleQuestion,
  CircleXmark,
  Clock,
  Comment,
  Copy,
  CreditCard,
  Cup,
  Display,
  Envelope,
  Eye,
  EyeSlash,
  File,
  FileArrowDown,
  Folder,
  Gear,
  Gift,
  Globe,
  Handset,
  Heart,
  House,
  Key,
  Layers,
  LayoutCells,
  LayoutSideContent,
  Link as LinkIcon,
  ListCheck,
  ListUl,
  Magnifier,
  MapPin,
  Medal,
  Minus,
  Moon,
  Paperclip,
  Pencil,
  Percent,
  Person,
  Persons,
  Picture,
  Plus,
  Printer,
  Pulse,
  QrCode,
  Receipt,
  Rocket,
  Shield,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Star,
  Sun,
  Camera,
  Video,
  Tag,
  Ticket,
  TrashBin,
  Funnel,
  WalletDot,
  TriangleExclamation,
  TShirt,
  Wallet,
  Wrench,
  Xmark,
} from "@gravity-ui/icons";
import type { SVGProps } from "react";

/*
 * One concept, one glyph — and no two destinations that sit next to each other
 * may share a glyph, or the navigation stops communicating anything. That is
 * why `marketplace`, `storefront`, `cart`, `home` and `dashboard` are five
 * visually distinct icons rather than five spellings of the same shopping bag,
 * and why `listing`, `categories`, `orders` and `transactions` no longer
 * collapse into the same list/receipt shape.
 */
const ICONS = {
  // Workspace navigation
  /**
   * The workspace itself: a stack of layers — a collection of elements piled
   * into one place. Deliberately unlike the dashboard's cell grid, the
   * marketplace basket, the shop bag and the product box.
   */
  workspace: Layers,
  /**
   * The overview page: an asymmetrically segmented layout (a main area beside
   * a panel) — an organised dashboard composition, deliberately unlike the
   * uniform grid that reads as a net.
   */
  dashboard: LayoutSideContent,
  /** A seller's public storefront — a shop bag. */
  storefront: ShoppingBag,
  /** Shop discovery on the marketplace — the same shop language as a storefront. */
  shop: ShoppingBag,
  /** The whole catalogue — a basket of everything on the platform. */
  marketplace: ShoppingBasket,
  home: House,
  /** A sellable product — a sealed package/box. */
  products: Box,
  services: Wrench,
  events: Calendar,
  digital: FileArrowDown,
  food: Cup,
  /** A collection of things, which is what a category is. */
  categories: Folder,
  /** The catalogue as a flat list, distinct from the category collection. */
  listing: ListUl,
  inventory: Boxes3,
  orders: Receipt,
  customers: Persons,
  discounts: Percent,
  finance: Wallet,
  transactions: WalletDot,
  payouts: CircleDollar,
  analytics: ChartLine,
  reviews: Star,
  settings: Gear,
  account: Person,
  security: Shield,
  payments: CreditCard,

  // Marketplace categories
  fashion: TShirt,
  furniture: House,
  electronics: Display,
  vehicles: Car,
  beauty: Sparkles,
  general: ShoppingBag,

  // Status
  check: Check,
  checkCircle: CircleCheck,
  alert: TriangleExclamation,
  info: CircleInfo,
  x: Xmark,
  xCircle: CircleXmark,
  clock: Clock,
  spinner: ArrowRotateRight,

  // Actions
  search: Magnifier,
  menu: Bars,
  plus: Plus,
  minus: Minus,
  edit: Pencil,
  trash: TrashBin,
  eye: Eye,
  eyeOff: EyeSlash,
  upload: ArrowUpFromLine,
  download: ArrowDownToLine,
  /** The composer's attach control — a clip, not another upload arrow. */
  attach: Paperclip,
  /** Sending a message: forward, on its way to the other side. */
  send: ArrowRight,
  camera: Camera,
  video: Video,
  signOut: ArrowRightFromSquare,
  image: Picture,
  file: File,
  folder: Folder,
  more: CaretsExpandVertical,
  copy: Copy,
  share: ArrowUpFromSquare,
  link: LinkIcon,
  externalLink: ArrowUpRightFromSquare,
  refresh: ArrowRotateRight,
  printer: Printer,
  qr: QrCode,
  grid: LayoutCells,
  list: ListUl,

  // Commerce
  tag: Tag,
  filter: Funnel,
  bank: WalletDot,
  cart: ShoppingCart,
  receipt: Receipt,
  ticket: Ticket,
  price: CircleDollar,
  wallet: Wallet,
  creditCard: CreditCard,
  packageCheck: Boxes3,
  percent: Percent,

  // People, places, contact
  user: Person,
  userPlus: Person,
  users: Persons,
  mail: Envelope,
  phone: Handset,
  mapPin: MapPin,
  globe: Globe,

  // Metrics
  chart: ChartLine,
  chartBar: ChartBar,
  chartPie: ChartPie,
  pulse: Pulse,
  activity: Pulse,
  trendingUp: ArrowUpRight,
  trendingDown: ArrowDownRight,

  // Misc
  sun: Sun,
  moon: Moon,
  star: Star,
  heart: Heart,
  medal: Medal,
  checkBadge: CircleCheck,
  sparkle: Sparkles,
  rocket: Rocket,
  shield: Shield,
  key: Key,
  bell: Bell,
  message: Comment,
  listCheck: ListCheck,
  help: CircleQuestion,
  gift: Gift,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronsUpDown: CaretsExpandVertical,
  expand: CaretsExpandVertical,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
} as const;

export type IconName = keyof typeof ICONS;

/** True when a stored string is one of our icon names. */
export function isIconName(value: string | null | undefined): value is IconName {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(ICONS, value as string);
}

export function Icon({
  name,
  size = 16,
  className,
  ...rest
}: {
  name: IconName;
  size?: number;
  /** Gravity icons take all SVG props; HeroUI passes aria-hidden for decorative icons. */
} & Omit<SVGProps<SVGSVGElement>, "name">) {
  const Glyph = ICONS[name];

  return (
    <Glyph
      aria-hidden="true"
      className={className}
      focusable="false"
      height={size}
      width={size}
      {...rest}
    />
  );
}

/**
 * The brand mark: the link glyph itself.
 *
 * A chain link is the whole idea of the brand — one link that everything else
 * hangs from — and the icon set already draws it, simply and cleanly, on its own
 * 16px grid. So the mark *is* that glyph rather than a redrawn lookalike: one
 * shape, drawn once, that cannot drift out of step with the icon used everywhere
 * else in the platform.
 *
 * It is drawn in `currentColor`, so it is theme-aware by construction and
 * legible on the navbar, in the footer and on the auth card in both themes with
 * nothing behind it. `className` sets the mark's real size — it is deliberately
 * large by default, because it is the primary logo.
 */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/**
         * The mark's treatment, exactly as the design system prescribes: strong
         * dark elements, one controlled accent, and a *subtle* gradient — the
         * accent trio across the glyph: light violet mixed with a touch of dark
         * violet, then amber milk. No background and no frame: clean geometry
         * alone carries it, and the dark start keeps it instantly legible at
         * 16px. The stops are the shared `--ls-*` tokens (via the `.ls-grad-*`
         * classes), so the logo follows the theme with no second palette.
         */}
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="ls-logo"
          x1="1.5"
          x2="14.5"
          y1="13.5"
          y2="2.5"
        >
          <stop className="ls-grad-iris-deep" offset="0" />
          <stop className="ls-grad-iris" offset="0.5" />
          <stop className="ls-grad-milk" offset="1" />
        </linearGradient>
      </defs>
      {/* The exact link glyph, kept — only its treatment changes. */}
      <path
        clipRule="evenodd"
        d="M3.47 6.53a.75.75 0 0 1 1.06 1.061l-.727.727a2.743 2.743 0 0 0 3.879 3.879l.727-.727a.75.75 0 0 1 1.06 1.06l-.726.727a4.243 4.243 0 0 1-6-6zm8 1.879a.75.75 0 0 0 1.06 1.06l.727-.726a4.243 4.243 0 0 0-6-6l-.727.727a.75.75 0 0 0 1.061 1.06l.727-.727a2.743 2.743 0 0 1 3.879 3.879zm-.94-1.879a.75.75 0 1 0-1.06-1.06l-4 4a.75.75 0 1 0 1.06 1.06z"
        fill="url(#ls-logo)"
        fillRule="evenodd"
      />
    </svg>
  );
}

/**
 * The wordmark, set in text rather than an image.
 *
 * `LINK` is the strong dark element; `STORE` carries the one controlled accent —
 * the touch of dark violet from the trio. Type only: no background, no frame,
 * readable at every size.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`text-[15px] font-semibold tracking-tight ${className}`}>
      LINK <span className="ls-wordmark-accent">STORE</span>
    </span>
  );
}
