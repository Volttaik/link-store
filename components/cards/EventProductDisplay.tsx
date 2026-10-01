"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent } from "react";
import { ProductImage } from "@/components/marketplace/ProductImage";
import { Icon } from "@/components/ui/Icon";
import { formatMoney } from "@/lib/money";
import type { ListingCardData } from "@/lib/types";

/** The fan holds the front card plus two feathers on each side. */
const STACK_SIZE = 5;
const DRAG_THRESHOLD = 40;

const wrap = (value: number, length: number) => ((value % length) + length) % length;

/**
 * The event preview — a peacock fan of real product cards.
 *
 * The products an event collects are laid out as one deliberate fan, not a
 * scattered pile: a nearly upright card in front, then cards spreading out to
 * the left and right, each one a little further, a little more turned and a
 * little smaller than the last, with their bases riding a shallow upward curve.
 * Every position is fixed by the card's slot, so the arrangement is identical
 * every time — nothing is randomised and nothing drifts.
 *
 * Each card is one complete product, with no card inside a card and no panel
 * around the stack. Dragging or swiping the front card away brings the next one
 * forward along the same fan; the two small controls do the same for keyboard
 * and click users. Nothing rotates on a timer and nothing moves on its own.
 */
export function EventProductDisplay({ products, title }: { products: ListingCardData[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ id: number; x: number; y: number; horizontal: boolean } | null>(null);
  // A drag ends in a click on the card; swallow only that click, not a later one.
  const suppressClickUntil = useRef(0);

  const count = products.length;
  const multiple = count > 1;
  // How many feathers the fan needs on each side; used only to reserve height.
  const rings = count <= 1 ? 0 : count <= 3 ? 1 : 2;
  const step = (direction: number) => { if (multiple) setIndex(previous => wrap(previous + direction, count)); };

  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    if (start.horizontal) {
      suppressClickUntil.current = Date.now() + 400;
      const distance = event.clientX - start.x;
      if (!cancelled && Math.abs(distance) >= DRAG_THRESHOLD) step(distance < 0 ? 1 : -1);
    }
    gesture.current = null;
    setDrag(0);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (!count) return <div className="event-stack-empty">Products in this collection are not available right now.</div>;

  return <div className="event-stack" role="region" aria-roledescription="Product stack" aria-label={`Products in ${title}`}>
    <div
      className={`event-stack-scene${dragging ? " is-dragging" : ""}`}
      data-event-display
      data-fan={rings}
      tabIndex={multiple ? 0 : -1}
      onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); step(event.key === "ArrowRight" ? 1 : -1); } }}
      onPointerDown={event => { if (!multiple || !event.isPrimary || event.button !== 0) return; gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false }; }}
      onPointerMove={event => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const x = event.clientX - start.x, y = event.clientY - start.y;
        if (!start.horizontal && Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) { gesture.current = null; return; }
        if (!start.horizontal && Math.abs(x) > 10 && Math.abs(x) > Math.abs(y)) { start.horizontal = true; setDragging(true); try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* the pointer is not live (e.g. a synthetic event); dragging still works */ } }
        if (start.horizontal) setDrag(Math.max(-260, Math.min(260, x)));
      }}
      onPointerUp={event => finish(event)}
      onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={() => { gesture.current = null; setDrag(0); setDragging(false); }}
      onDragStart={event => event.preventDefault()}
      onClickCapture={event => { if (Date.now() < suppressClickUntil.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }}
    >
      {products.map((product, position) => {
        const depth = wrap(position - index, count);
        if (depth >= STACK_SIZE) return null;
        const front = depth === 0;
        return <Link
          key={product.id}
          href={`/listing/${product.id}`}
          draggable={false}
          tabIndex={front ? 0 : -1}
          aria-hidden={!front}
          data-event-product={product.id}
          data-depth={depth}
          data-front={front ? "true" : "false"}
          className={`event-stack-card ls-focus-ring no-underline${front ? "" : " is-behind"}`}
          style={{ zIndex: STACK_SIZE - depth, transform: front && dragging ? `translate(-50%, 0) translateX(${drag}px) rotate(${drag * 0.04}deg)` : undefined }}
        >
          <span className="event-stack-photo">{product.imageUrl ? <ProductImage key={product.imageUrl} src={product.imageUrl} title={product.title} /> : null}</span>
          <span className="event-stack-meta">
            <span className="event-stack-context">{product.categoryName ?? product.storeName}</span>
            <span className="event-stack-title">{product.title}</span>
            <span className="event-stack-price">{formatMoney(product.price, product.currency)}</span>
          </span>
        </Link>;
      })}
    </div>

    {multiple ? <div className="event-stack-controls">
      <button type="button" aria-label={`Previous product in ${title}`} onClick={() => step(-1)} className="event-stack-button ls-focus-ring"><Icon name="arrowLeft" size={15} /></button>
      <span className="event-stack-hint">Swipe or drag to explore</span>
      <button type="button" aria-label={`Next product in ${title}`} onClick={() => step(1)} className="event-stack-button ls-focus-ring"><Icon name="arrowRight" size={15} /></button>
    </div> : null}

    <p className="sr-only" aria-live="polite" aria-atomic="true">{products[index].title}, {formatMoney(products[index].price, products[index].currency)}</p>
  </div>;
}
