import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Printer, FileDown, Trash2, Edit3, X, Check, Receipt as ReceiptIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { MedicineAutocomplete, type MedicineSuggestion } from "@/components/pos/MedicineAutocomplete";
import { ReceiptPreview } from "@/components/pos/ReceiptPreview";
import {
  type BillItem,
  buildReceiptText,
  billGrandTotal,
  billSubtotal,
  billDiscount,
  billExtraDiscount,
  generateInvoiceNumber,
  lineTotal,
  storeFromSettings,
  DEFAULT_STORE,
} from "@/lib/pos";
import { fmtMoney } from "@/lib/format";
import { downloadReceiptPdf, printReceipt } from "@/lib/print";
import { useSettings, widthChars, DEFAULT_SETTINGS } from "@/lib/settings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Billing — MediPOS" },
      { name: "description", content: "Create new pharmacy bills and print 80mm thermal receipts." },
    ],
  }),
  component: BillingPage,
});

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function BillingPage() {
  // ── Settings (drives receipt rendering) ──────────────────────
  const { data: settings } = useSettings();
  const s = settings ?? DEFAULT_SETTINGS;

  // ── Medicine suggestions ─────────────────────────────────────
  const { data: medicines = [] } = useQuery({
    queryKey: ["medicines"],
    queryFn: async (): Promise<MedicineSuggestion[]> => {
      const { data, error } = await supabase
        .from("medicines")
        .select("id, name, unit_price, stock")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((m) => ({
        ...m,
        unit_price: Number(m.unit_price),
        stock: m.stock,
      }));
    },
  });

  const stockById = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of medicines) map.set(m.id, m.stock ?? 0);
    return map;
  }, [medicines]);
  const idByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of medicines) map.set(m.name.toLowerCase(), m.id);
    return map;
  }, [medicines]);

  // ── Form state ───────────────────────────────────────────────
  const [name, setName] = useState("");
  const [qty, setQty] = useState<string>("1");
  const [price, setPrice] = useState<string>("");
  const [discount, setDiscount] = useState<string>("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [items, setItems] = useState<BillItem[]>([]);
  const [customer, setCustomer] = useState("");
  const [billDiscMode, setBillDiscMode] = useState<"pct" | "amt">("pct");
  const [billDiscValue, setBillDiscValue] = useState<string>("0");

  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const discRef = useRef<HTMLInputElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const resetForm = () => {
    setName("");
    setQty("1");
    setPrice("");
    setDiscount("0");
    setEditingId(null);
  };

  const addOrUpdate = () => {
    const trimmed = name.trim();
    const q = Number(qty);
    const p = Number(price);
    const d = Number(discount);
    if (!trimmed) return toast.error("Medicine name is required");
    if (!Number.isFinite(q) || q <= 0) return toast.error("Quantity must be > 0");
    if (!Number.isFinite(p) || p < 0) return toast.error("Unit price is invalid");
    if (!Number.isFinite(d) || d < 0 || d > 100) return toast.error("Discount must be 0–100");

    // Stock guard: only enforced when the typed name matches a catalog item.
    const medId = idByName.get(trimmed.toLowerCase());
    if (medId) {
      const inStock = stockById.get(medId) ?? 0;
      // Sum quantity already in cart for the same medicine (excluding the row being edited).
      const already = items
        .filter((it) => it.id !== editingId && it.name.toLowerCase() === trimmed.toLowerCase())
        .reduce((s, it) => s + it.qty, 0);
      if (inStock <= 0) return toast.error(`${trimmed} is out of stock`);
      if (already + q > inStock)
        return toast.error(
          `Only ${inStock - already} unit${inStock - already === 1 ? "" : "s"} of ${trimmed} available`,
        );
    }

    if (editingId) {
      setItems((arr) =>
        arr.map((it) =>
          it.id === editingId
            ? { ...it, name: trimmed, qty: q, unitPrice: p, discountPct: d }
            : it,
        ),
      );
      toast.success("Item updated");
    } else {
      setItems((arr) => [
        ...arr,
        { id: uid(), name: trimmed, qty: q, unitPrice: p, discountPct: d },
      ]);
    }
    resetForm();
    // refocus name input via id
    const el = document.getElementById("med-name") as HTMLInputElement | null;
    el?.focus();
  };

  const startEdit = (it: BillItem) => {
    setEditingId(it.id);
    setName(it.name);
    setQty(String(it.qty));
    setPrice(String(it.unitPrice));
    setDiscount(String(it.discountPct));
    document.getElementById("med-name")?.focus();
  };

  const removeItem = (id: string) =>
    setItems((arr) => arr.filter((i) => i.id !== id));

  // ── Totals ───────────────────────────────────────────────────
  const subtotal = useMemo(() => billSubtotal(items), [items]);
  const lineDiscountTotal = useMemo(() => billDiscount(items), [items]);
  const itemsTotal = useMemo(() => billGrandTotal(items), [items]);
  const billDiscNum = Number(billDiscValue) || 0;
  const billDiscAmount = useMemo(
    () => billExtraDiscount(items, billDiscNum, billDiscMode),
    [items, billDiscNum, billDiscMode],
  );
  const payable = useMemo(
    () => Math.max(0, itemsTotal - billDiscAmount),
    [itemsTotal, billDiscAmount],
  );
  const totalDiscountForSave = lineDiscountTotal + billDiscAmount;

  // ── Receipt dialog ───────────────────────────────────────────
  const [showReceipt, setShowReceipt] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const receiptText = useMemo(
    () =>
      buildReceiptText(
        items,
        invoiceNumber || generateInvoiceNumber(),
        storeFromSettings(s),
        customer || undefined,
        new Date(),
        {
          width: widthChars(s.paper_width),
          showDiscount: s.show_discount,
          showUnitPrice: s.show_unit_price,
          extraDiscountValue: billDiscNum,
          extraDiscountMode: billDiscMode,
        },
      ),
    [items, invoiceNumber, customer, s, billDiscNum, billDiscMode],
  );

  const qc = useQueryClient();
  const saveInvoice = useMutation({
    mutationFn: async (inv: string) => {
      const { error } = await supabase.from("invoices").insert({
        invoice_number: inv,
        customer_name: customer || null,
        subtotal,
        discount_total: totalDiscountForSave,
        grand_total: payable,
        items: items as unknown as never,
      });
      if (error) throw error;

      // Auto-deduct stock for any items that match the catalog.
      // Aggregate by medicine id so duplicate rows in the cart hit a single update.
      const totals = new Map<string, number>();
      for (const it of items) {
        const id = idByName.get(it.name.toLowerCase());
        if (!id) continue;
        totals.set(id, (totals.get(id) ?? 0) + it.qty);
      }
      const failed: string[] = [];
      for (const [id, qty] of totals) {
        const { data, error: rpcErr } = await supabase.rpc("decrement_stock", {
          _id: id,
          _qty: qty,
        });
        if (rpcErr || data === null) {
          const med = medicines.find((m) => m.id === id);
          failed.push(med?.name ?? id);
        }
      }
      if (failed.length > 0) {
        toast.warning("Some stock was not deducted", {
          description: failed.join(", "),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["medicines"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const openReceipt = async () => {
    if (items.length === 0) return toast.error("Add at least one item");
    const inv = generateInvoiceNumber();
    setInvoiceNumber(inv);
    setShowReceipt(true);
    try {
      await saveInvoice.mutateAsync(inv);
      toast.success("Invoice saved");
    } catch (e) {
      toast.error("Failed to save invoice", { description: (e as Error).message });
    }
  };

  const onPrint = () => printReceipt();
  const onPdf = () =>
    downloadReceiptPdf(receiptText, `${invoiceNumber || "receipt"}.pdf`, s.paper_width);

  const newSale = () => {
    setShowReceipt(false);
    setItems([]);
    setCustomer("");
    setInvoiceNumber("");
    setBillDiscValue("0");
    setBillDiscMode("pct");
    resetForm();
  };

  // ── Keyboard shortcut: Ctrl/Cmd+P opens receipt ──────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") {
        e.preventDefault();
        if (items.length > 0) openReceipt();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Bill</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add items, then print a thermal receipt. <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">Ctrl</kbd>{" "}
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">Enter</kbd> to checkout.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="customer" className="text-sm text-muted-foreground">Customer</Label>
          <Input
            id="customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Optional"
            className="w-56"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT: form + items */}
        <div className="space-y-6">
          <Card className="p-5">
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-5">
                <Label htmlFor="med-name">Medicine</Label>
                <div className="mt-1.5">
                  <MedicineAutocomplete
                    inputId="med-name"
                    value={name}
                    onChange={setName}
                    suggestions={medicines}
                    onSelect={(m) => {
                      setName(m.name);
                      setPrice(String(m.unit_price));
                      qtyRef.current?.focus();
                      qtyRef.current?.select();
                    }}
                    onEnterEmpty={() => qtyRef.current?.focus()}
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="qty">Qty</Label>
                <Input
                  id="qty"
                  ref={qtyRef}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), priceRef.current?.focus())}
                  className="mt-1.5"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="price">Unit Price</Label>
                <Input
                  id="price"
                  ref={priceRef}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), discRef.current?.focus())}
                  className="mt-1.5"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="disc">Discount %</Label>
                <Input
                  id="disc"
                  ref={discRef}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.5"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBtnRef.current?.click())}
                  className="mt-1.5"
                />
              </div>
              <div className="md:col-span-1 flex items-end">
                <Button
                  ref={addBtnRef}
                  onClick={addOrUpdate}
                  className="mt-1.5 w-full"
                  title={editingId ? "Update item" : "Add item (Enter)"}
                >
                  {editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {editingId && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Editing item.</span>
                <button onClick={resetForm} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <X className="h-3 w-3" /> cancel
                </button>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Medicine</th>
                  <th className="w-16 px-2 py-3 text-center">Qty</th>
                  <th className="w-24 px-2 py-3 text-right">Price</th>
                  <th className="w-20 px-2 py-3 text-right">Disc%</th>
                  <th className="w-28 px-2 py-3 text-right">Total</th>
                  <th className="w-24 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No items yet. Use the form above to add medicines.
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium">{it.name}</td>
                      <td className="px-2 py-3 text-center font-mono">{it.qty}</td>
                      <td className="px-2 py-3 text-right font-mono">{fmtMoney(it.unitPrice)}</td>
                      <td className="px-2 py-3 text-right font-mono">{it.discountPct}%</td>
                      <td className="px-2 py-3 text-right font-mono font-semibold">{fmtMoney(lineTotal(it))}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => startEdit(it)} title="Edit">
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => removeItem(it.id)} title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </div>

        {/* RIGHT: totals */}
        <Card className="h-fit p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Items</dt>
              <dd className="font-mono">{items.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-mono">{fmtMoney(subtotal)}</dd>
            </div>
            {lineDiscountTotal > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Item discount</dt>
                <dd className="font-mono text-destructive">−{fmtMoney(lineDiscountTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">After items</dt>
              <dd className="font-mono">{fmtMoney(itemsTotal)}</dd>
            </div>
          </dl>

          {/* Bill-level discount */}
          <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Total Discount
            </Label>
            <div className="mt-2 flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={billDiscValue}
                onChange={(e) => setBillDiscValue(e.target.value)}
                className="font-mono"
                placeholder="0"
              />
              <Select value={billDiscMode} onValueChange={(v) => setBillDiscMode(v as "pct" | "amt")}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pct">%</SelectItem>
                  <SelectItem value="amt">Amt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {billDiscAmount > 0 && (
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-muted-foreground">Applied discount</span>
                <span className="font-mono text-destructive">−{fmtMoney(billDiscAmount)}</span>
              </div>
            )}
          </div>

          <div className="my-4 h-px bg-border" />
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-muted-foreground">Grand Total</span>
            <span className="font-mono text-3xl font-semibold tracking-tight text-primary">
              {fmtMoney(payable)}
            </span>
          </div>
          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={items.length === 0}
            onClick={openReceipt}
          >
            <ReceiptIcon className="h-4 w-4" />
            Checkout & Print
          </Button>
          {items.length > 0 && (
            <button
              className="mt-2 w-full text-xs text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm("Clear all items?")) setItems([]);
              }}
            >
              Clear all items
            </button>
          )}
        </Card>
      </div>

      {/* Receipt dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receipt Preview</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            <div className="receipt-print">
              <ReceiptPreview
                store={storeFromSettings(s)}
                items={items}
                invoiceNumber={invoiceNumber || "—"}
                customerName={customer || undefined}
                paperWidth={s.paper_width}
                fontSize={s.font_size}
                showDiscount={s.show_discount}
                showUnitPrice={s.show_unit_price}
                extraDiscountValue={billDiscNum}
                extraDiscountMode={billDiscMode}
              />
            </div>
          </div>
          <DialogFooter className="no-print flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={onPdf} className="w-full sm:w-auto">
              <FileDown className="h-4 w-4" /> Save PDF
            </Button>
            <Button onClick={onPrint} className="w-full sm:w-auto">
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button variant="secondary" onClick={newSale} className="w-full sm:w-auto">
              New Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
