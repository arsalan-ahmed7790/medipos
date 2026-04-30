import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, FileDown, Eye, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/format";
import { ReceiptPreview } from "@/components/pos/ReceiptPreview";
import { buildReceiptText, storeFromSettings, type BillItem } from "@/lib/pos";
import { downloadReceiptPdf, printReceipt } from "@/lib/print";
import { useSettings, widthChars } from "@/lib/settings";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  grand_total: number;
  items: BillItem[];
  created_at: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Invoice History — MediPOS" },
      { name: "description", content: "View, search, reprint, and export past pharmacy invoices." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const [openInv, setOpenInv] = useState<InvoiceRow | null>(null);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(todayIso());
  const [search, setSearch] = useState("");

  const { data: settings } = useSettings();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", from, to],
    queryFn: async (): Promise<InvoiceRow[]> => {
      const start = `${from}T00:00:00.000Z`;
      const end = `${to}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, grand_total, items, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        grand_total: Number(r.grand_total),
        items: r.items as unknown as BillItem[],
      }));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (i) =>
        i.invoice_number.toLowerCase().includes(q) ||
        (i.customer_name ?? "").toLowerCase().includes(q),
    );
  }, [invoices, search]);

  const paperWidth = settings?.paper_width ?? "80mm";
  const fontSize = settings?.font_size ?? "medium";
  const showDiscount = settings?.show_discount ?? true;
  const showUnitPrice = settings?.show_unit_price ?? true;
  const store = settings ? storeFromSettings(settings) : { name: "MEDICAL STORE" };

  const receiptText = openInv
    ? buildReceiptText(
        openInv.items,
        openInv.invoice_number,
        store,
        openInv.customer_name ?? undefined,
        new Date(openInv.created_at),
        { width: widthChars(paperWidth), showDiscount, showUnitPrice },
      )
    : "";

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoice History</h1>
          <p className="mt-1 text-sm text-muted-foreground">Search and reprint past sales.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="h-from" className="text-xs uppercase tracking-wide text-muted-foreground">From</Label>
            <Input id="h-from" type="date" className="mt-1 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="h-to" className="text-xs uppercase tracking-wide text-muted-foreground">To</Label>
            <Input id="h-to" type="date" className="mt-1 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-[34px] h-4 w-4 text-muted-foreground" />
            <Label htmlFor="h-search" className="text-xs uppercase tracking-wide text-muted-foreground">
              Search
            </Label>
            <Input
              id="h-search"
              className="mt-1 w-56 pl-8"
              placeholder="Invoice # or customer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Card className="mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Invoice #</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-right">Items</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No invoices found.</td></tr>
            ) : (
              filtered.map((inv) => (
                <tr key={inv.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(inv.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{inv.customer_name || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-right font-mono">{inv.items?.length ?? 0}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{fmtMoney(inv.grand_total)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => setOpenInv(inv)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!openInv} onOpenChange={(o) => !o && setOpenInv(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{openInv?.invoice_number}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            <div className="receipt-print">
              {openInv && (
                <ReceiptPreview
                  store={store}
                  items={openInv.items}
                  invoiceNumber={openInv.invoice_number}
                  customerName={openInv.customer_name ?? undefined}
                  date={new Date(openInv.created_at)}
                  paperWidth={paperWidth}
                  fontSize={fontSize}
                  showDiscount={showDiscount}
                  showUnitPrice={showUnitPrice}
                />
              )}
            </div>
          </div>
          <DialogFooter className="no-print flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => downloadReceiptPdf(receiptText, `${openInv?.invoice_number}.pdf`, paperWidth)}
            >
              <FileDown className="h-4 w-4" /> PDF
            </Button>
            <Button onClick={() => printReceipt()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
