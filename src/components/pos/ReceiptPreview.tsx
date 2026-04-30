// Receipt preview rendered as a real DOM grid (monospace) so columns ALWAYS
// align — not just whitespace inside <pre>. Supports 58mm / 80mm + bill discount.
import { cn } from "@/lib/utils";
import type { BillItem, StoreInfo } from "@/lib/pos";
import {
  billDiscount,
  billExtraDiscount,
  billGrandTotal,
  billSubtotal,
  lineDiscount,
  lineTotal,
} from "@/lib/pos";
import type { FontSize, PaperWidth } from "@/lib/settings";
import { fontSizePx, widthPx } from "@/lib/settings";

interface Props {
  store: StoreInfo;
  items: BillItem[];
  invoiceNumber: string;
  customerName?: string;
  date?: Date;
  paperWidth: PaperWidth;
  fontSize: FontSize;
  showDiscount: boolean;
  showUnitPrice: boolean;
  /** Bill-level discount value (percent or amount). */
  extraDiscountValue?: number;
  extraDiscountMode?: "pct" | "amt";
  className?: string;
}

export function ReceiptPreview({
  store,
  items,
  invoiceNumber,
  customerName,
  date = new Date(),
  paperWidth,
  fontSize,
  showDiscount,
  showUnitPrice,
  extraDiscountValue = 0,
  extraDiscountMode = "pct",
  className,
}: Props) {
  const w = widthPx(paperWidth);
  const fs = fontSizePx(fontSize);
  const dateStr = date.toISOString().slice(0, 10);
  const timeStr = date.toTimeString().slice(0, 5);

  const sub = billSubtotal(items);
  const lineDisc = billDiscount(items);
  const itemsTotal = billGrandTotal(items);
  const extraDisc = billExtraDiscount(items, extraDiscountValue, extraDiscountMode);
  const payable = Math.max(0, itemsTotal - extraDisc);

  // 4-column grid: Item (flex) | Qty | Price (optional) | Total
  // Item spans all columns when name wraps (handled by .rcpt-name spanning all).
  const cols = showUnitPrice
    ? "1fr 2.2em 3.2em 3.6em"
    : "1fr 2.2em 3.6em";
  const colCount = showUnitPrice ? 4 : 3;

  return (
    <div
      className={cn("receipt-paper", className)}
      style={{ width: w, fontSize: fs }}
    >
      {/* Store header */}
      <div className="rcpt-center rcpt-bold rcpt-lg">
        {store.name.toUpperCase()}
      </div>
      {store.addressLine && <div className="rcpt-center">{store.addressLine}</div>}
      {store.phone && <div className="rcpt-center">{store.phone}</div>}

      <Divider />

      {/* Meta */}
      <div className="rcpt-row">
        <span>Date: {dateStr}</span>
        <span>Time: {timeStr}</span>
      </div>
      <div>Invoice: {invoiceNumber}</div>
      {customerName && <div>Customer: {customerName}</div>}

      <Divider />

      {/* Column header */}
      <div
        className="rcpt-grid rcpt-bold"
        style={{ gridTemplateColumns: cols }}
      >
        <span className="text-left">Item</span>
        <span className="text-center">Qty</span>
        {showUnitPrice && <span className="text-right">Price</span>}
        <span className="text-right">Total</span>
      </div>

      <Divider />

      {/* Items */}
      {items.length === 0 && (
        <div className="rcpt-center rcpt-muted">— no items —</div>
      )}
      {items.map((it) => (
        <div
          key={it.id}
          className="rcpt-grid rcpt-item"
          style={{ gridTemplateColumns: cols }}
        >
          <span className="rcpt-name text-left">{it.name}</span>
          <span className="text-center">{it.qty}</span>
          {showUnitPrice && (
            <span className="text-right">{it.unitPrice.toFixed(2)}</span>
          )}
          <span className="text-right">{lineTotal(it).toFixed(2)}</span>
          {showDiscount && it.discountPct > 0 && (
            <span
              className="rcpt-discount text-right"
              style={{ gridColumn: `1 / span ${colCount}` }}
            >
              (disc {it.discountPct}% -{lineDiscount(it).toFixed(2)})
            </span>
          )}
        </div>
      ))}

      <Divider />

      {/* Totals */}
      <TotalRow label="Subtotal" value={sub.toFixed(2)} />
      {showDiscount && lineDisc > 0 && (
        <TotalRow label="Item Disc" value={`-${lineDisc.toFixed(2)}`} />
      )}
      {extraDisc > 0 && (
        <TotalRow
          label={
            extraDiscountMode === "pct"
              ? `Discount (${extraDiscountValue}%)`
              : "Discount"
          }
          value={`-${extraDisc.toFixed(2)}`}
        />
      )}
      <TotalRow label="TOTAL" value={payable.toFixed(2)} bold />

      <Divider />

      {store.footer && (
        <div className="rcpt-center rcpt-bold">{store.footer}</div>
      )}
      <div style={{ height: 8 }} />

      {/* Invoice number at bottom */}
      <div className="rcpt-center rcpt-muted" style={{ fontSize: fs - 1 }}>
        #{invoiceNumber}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="rcpt-divider" />;
}

function TotalRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={cn("rcpt-row", bold && "rcpt-bold")}>
      <span>{label}{bold ? "" : ":"}</span>
      <span>{value}</span>
    </div>
  );
}
