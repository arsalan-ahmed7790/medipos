// Business logic for the POS: types, totals, receipt text builder.

import type { StoreSettings } from "@/lib/settings";

export interface BillItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
}

export interface StoreInfo {
  name: string;
  addressLine?: string;
  phone?: string;
  footer?: string;
}

export const DEFAULT_STORE: StoreInfo = {
  name: "MEDICAL STORE",
  addressLine: "123 Main St, City",
  phone: "+1 555 123 4567",
  footer: "Thank You — Get Well Soon!",
};

export const storeFromSettings = (s: StoreSettings): StoreInfo => ({
  name: s.store_name,
  addressLine: s.address_line ?? undefined,
  phone: s.phone ?? undefined,
  footer: s.footer ?? undefined,
});

/** Line total after discount. */
export const lineTotal = (item: BillItem): number => {
  const gross = item.qty * item.unitPrice;
  return gross - (gross * item.discountPct) / 100;
};

export const lineDiscount = (item: BillItem): number =>
  (item.qty * item.unitPrice * item.discountPct) / 100;

export const billSubtotal = (items: BillItem[]): number =>
  items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

export const billDiscount = (items: BillItem[]): number =>
  items.reduce((s, i) => s + lineDiscount(i), 0);

export const billGrandTotal = (items: BillItem[]): number =>
  items.reduce((s, i) => s + lineTotal(i), 0);

/** Bill-level discount value. `mode` = "pct" → percent of items-after-line-discounts; "amt" → flat amount. */
export const billExtraDiscount = (
  items: BillItem[],
  value: number,
  mode: "pct" | "amt",
): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (mode === "pct") {
    const base = billGrandTotal(items);
    const pct = Math.min(100, Math.max(0, value));
    return (base * pct) / 100;
  }
  return Math.min(billGrandTotal(items), Math.max(0, value));
};

/** Final payable = items grand total − bill-level discount (floored at 0). */
export const billPayable = (
  items: BillItem[],
  extraDiscountValue = 0,
  extraDiscountMode: "pct" | "amt" = "pct",
): number =>
  Math.max(
    0,
    billGrandTotal(items) - billExtraDiscount(items, extraDiscountValue, extraDiscountMode),
  );

/** Generate invoice number like INV-20260420-HHMMSS. */
export const generateInvoiceNumber = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const t =
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0") +
    String(d.getSeconds()).padStart(2, "0");
  return `INV-${y}${m}${day}-${t}`;
};

/** Word-wrap a long string to a fixed character width. */
export const wrapText = (text: string, width: number): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (w.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let rest = w;
      while (rest.length > width) {
        lines.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      current = rest;
      continue;
    }
    if ((current + (current ? " " : "") + w).length > width) {
      lines.push(current);
      current = w;
    } else {
      current = current ? current + " " + w : w;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
};

const padR = (s: string, n: number) =>
  s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
const padL = (s: string, n: number) =>
  s.length >= n ? s.slice(-n) : " ".repeat(n - s.length) + s;
const center = (s: string, n: number) => {
  if (s.length >= n) return s.slice(0, n);
  const left = Math.floor((n - s.length) / 2);
  return " ".repeat(left) + s + " ".repeat(n - s.length - left);
};

export const RECEIPT_WIDTH = 32;

export interface ReceiptOptions {
  width?: number;
  showDiscount?: boolean;
  showUnitPrice?: boolean;
  /** Bill-level discount value */
  extraDiscountValue?: number;
  /** "pct" = percent, "amt" = flat amount */
  extraDiscountMode?: "pct" | "amt";
}

/** Plain-text receipt for raw printing / PDF / clipboard. */
export const buildReceiptText = (
  items: BillItem[],
  invoiceNumber: string,
  store: StoreInfo = DEFAULT_STORE,
  customerName?: string,
  date: Date = new Date(),
  opts: ReceiptOptions = {},
): string => {
  const W = opts.width ?? RECEIPT_WIDTH;
  const showDiscount = opts.showDiscount ?? true;
  const showUnitPrice = opts.showUnitPrice ?? true;
  const extraVal = opts.extraDiscountValue ?? 0;
  const extraMode = opts.extraDiscountMode ?? "pct";

  const dash = "-".repeat(W);
  const lines: string[] = [];

  lines.push(center(store.name.toUpperCase(), W));
  if (store.addressLine) lines.push(center(store.addressLine, W));
  if (store.phone) lines.push(center(store.phone, W));
  lines.push(dash);

  const dateStr = date.toISOString().slice(0, 10);
  const timeStr = date.toTimeString().slice(0, 5);
  lines.push(padR(`Date: ${dateStr}`, W - 11) + padL(`Time: ${timeStr}`, 11));
  lines.push(`Invoice: ${invoiceNumber}`);
  if (customerName) lines.push(`Customer: ${customerName}`);

  lines.push(dash);
  // Column header (Item on its own line above the numeric grid)
  lines.push("Item");
  const qtyCol = 4;
  const priceCol = showUnitPrice ? 9 : 0;
  const totalCol = W - qtyCol - priceCol;
  let header = padR("Qty", qtyCol);
  if (showUnitPrice) header += padL("Price", priceCol);
  header += padL("Total", totalCol);
  lines.push(header);
  lines.push(dash);

  for (const it of items) {
    for (const nl of wrapText(it.name, W)) lines.push(nl);
    let row = padR(String(it.qty), qtyCol);
    if (showUnitPrice) row += padL(it.unitPrice.toFixed(2), priceCol);
    row += padL(lineTotal(it).toFixed(2), totalCol);
    lines.push(row);
    if (showDiscount && it.discountPct > 0) {
      lines.push(padL(`(disc ${it.discountPct}% -${lineDiscount(it).toFixed(2)})`, W));
    }
  }

  lines.push(dash);
  const sub = billSubtotal(items);
  const lineDisc = billDiscount(items);
  const itemsTotal = billGrandTotal(items);
  const extraDisc = billExtraDiscount(items, extraVal, extraMode);
  const payable = Math.max(0, itemsTotal - extraDisc);

  lines.push(padR("Subtotal:", W - 12) + padL(sub.toFixed(2), 12));
  if (showDiscount && lineDisc > 0)
    lines.push(padR("Item Disc:", W - 12) + padL("-" + lineDisc.toFixed(2), 12));
  if (extraDisc > 0) {
    const label = extraMode === "pct" ? `Discount (${extraVal}%):` : "Discount:";
    lines.push(padR(label, W - 12) + padL("-" + extraDisc.toFixed(2), 12));
  }
  lines.push(padR("TOTAL:", W - 12) + padL(payable.toFixed(2), 12));
  lines.push(dash);

  if (store.footer) lines.push(center(store.footer, W));
  lines.push("");
  return lines.join("\n");
};
