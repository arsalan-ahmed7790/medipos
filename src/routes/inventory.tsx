// Inventory dashboard: KPIs (total value, low/out stock, expiring soon)
// + quick restock dialog. Read/write to the public.medicines table.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Package,
  AlertTriangle,
  XCircle,
  Wallet,
  CalendarClock,
  Plus,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/format";

interface InventoryItem {
  id: string;
  name: string;
  generic_name: string | null;
  category: string | null;
  unit_price: number;
  purchase_price: number;
  stock: number;
  low_stock_threshold: number;
  expiry_date: string | null;
  batch_number: string | null;
}

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — MediPOS" },
      {
        name: "description",
        content:
          "Pharmacy inventory dashboard: stock value, low-stock alerts, expiry tracking and quick restock.",
      },
    ],
  }),
  component: InventoryPage,
});

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function InventoryPage() {
  const qc = useQueryClient();
  const [restockOf, setRestockOf] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: async (): Promise<InventoryItem[]> => {
      const { data, error } = await supabase
        .from("medicines")
        .select(
          "id, name, generic_name, category, unit_price, purchase_price, stock, low_stock_threshold, expiry_date, batch_number",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []).map((m) => ({
        ...m,
        unit_price: Number(m.unit_price),
        purchase_price: Number(m.purchase_price),
      }));
    },
  });

  const restock = useMutation({
    mutationFn: async () => {
      if (!restockOf) return;
      const add = Number(restockQty);
      if (!Number.isFinite(add) || add <= 0)
        throw new Error("Enter a positive quantity");
      const { error } = await supabase
        .from("medicines")
        .update({ stock: restockOf.stock + add })
        .eq("id", restockOf.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock updated");
      setRestockOf(null);
      setRestockQty("");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["medicines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    let value = 0;
    let cost = 0;
    let low = 0;
    let out = 0;
    let expiring = 0;
    for (const m of items) {
      value += m.stock * m.unit_price;
      cost += m.stock * m.purchase_price;
      if (m.stock === 0) out++;
      else if (m.stock <= m.low_stock_threshold) low++;
      const d = daysUntil(m.expiry_date);
      if (d !== null && d <= 60 && d >= 0) expiring++;
    }
    return { value, cost, low, out, expiring, count: items.length };
  }, [items]);

  const lowStockList = items.filter((m) => m.stock > 0 && m.stock <= m.low_stock_threshold);
  const outOfStockList = items.filter((m) => m.stock === 0);
  const expiringList = items
    .map((m) => ({ ...m, _days: daysUntil(m.expiry_date) }))
    .filter((m) => m._days !== null && m._days >= 0 && m._days <= 60)
    .sort((a, b) => (a._days ?? 0) - (b._days ?? 0));

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time view of stock value, alerts and expiring medicines.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/medicines">
            <Plus className="h-4 w-4" /> Manage catalog
          </Link>
        </Button>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Wallet className="h-5 w-5 text-primary" />}
          label="Inventory value (retail)"
          value={fmtMoney(stats.value)}
          hint={`Cost basis ${fmtMoney(stats.cost)}`}
        />
        <Kpi
          icon={<Package className="h-5 w-5 text-primary" />}
          label="Total SKUs"
          value={String(stats.count)}
          hint={`${items.reduce((s, i) => s + i.stock, 0)} units in stock`}
        />
        <Kpi
          icon={<AlertTriangle className="h-5 w-5 text-warning" />}
          label="Low stock"
          value={String(stats.low)}
          hint="At or below threshold"
          tone="warning"
        />
        <Kpi
          icon={<XCircle className="h-5 w-5 text-destructive" />}
          label="Out of stock"
          value={String(stats.out)}
          hint={stats.expiring > 0 ? `${stats.expiring} expiring ≤ 60d` : "All items in stock"}
          tone="destructive"
        />
      </div>

      {isLoading ? (
        <Card className="mt-6 p-12 text-center text-sm text-muted-foreground">
          Loading inventory…
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ListCard
            title="Out of stock"
            empty="No items are out of stock."
            icon={<XCircle className="h-4 w-4 text-destructive" />}
            items={outOfStockList}
            renderRight={(m) => (
              <Button size="sm" variant="outline" onClick={() => setRestockOf(m)}>
                Restock <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          />
          <ListCard
            title="Low stock"
            empty="No low-stock alerts."
            icon={<AlertTriangle className="h-4 w-4 text-warning" />}
            items={lowStockList}
            renderRight={(m) => (
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">
                  {m.stock} / {m.low_stock_threshold}
                </span>
                <Button size="sm" variant="outline" onClick={() => setRestockOf(m)}>
                  Restock
                </Button>
              </div>
            )}
          />
          <Card className="lg:col-span-2 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="h-4 w-4 text-warning" />
                Expiring within 60 days
              </div>
              <span className="text-xs text-muted-foreground">{expiringList.length} items</span>
            </div>
            {expiringList.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No medicines expiring soon.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Batch</th>
                    <th className="px-4 py-2 text-left">Expiry</th>
                    <th className="px-4 py-2 text-right">Days left</th>
                    <th className="px-4 py-2 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringList.map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium">{m.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {m.batch_number ?? "—"}
                      </td>
                      <td className="px-4 py-2 font-mono">{m.expiry_date}</td>
                      <td className="px-4 py-2 text-right">
                        <Badge
                          variant="outline"
                          className={
                            (m._days ?? 0) <= 14
                              ? "border-destructive text-destructive"
                              : "border-warning text-warning"
                          }
                        >
                          {m._days}d
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{m.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {/* Restock dialog */}
      <Dialog open={!!restockOf} onOpenChange={(o) => !o && setRestockOf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restock</DialogTitle>
            <DialogDescription>
              Add units to <span className="font-medium">{restockOf?.name}</span>. Current
              stock: <span className="font-mono">{restockOf?.stock}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="restock-qty">Units to add</Label>
            <Input
              id="restock-qty"
              type="number"
              min={1}
              autoFocus
              value={restockQty}
              onChange={(e) => setRestockQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && restock.mutate()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestockOf(null)}>
              Cancel
            </Button>
            <Button onClick={() => restock.mutate()} disabled={restock.isPending}>
              {restock.isPending ? "Saving…" : "Add stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning" | "destructive";
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div
        className={
          "mt-2 text-2xl font-semibold tracking-tight " +
          (tone === "warning"
            ? "text-warning"
            : tone === "destructive"
              ? "text-destructive"
              : "")
        }
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function ListCard({
  title,
  icon,
  items,
  empty,
  renderRight,
}: {
  title: string;
  icon: React.ReactNode;
  items: InventoryItem[];
  empty: string;
  renderRight: (m: InventoryItem) => React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </div>
        <span className="text-xs text-muted-foreground">{items.length} items</span>
      </div>
      {items.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 12).map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">
                  {m.category ?? "—"} · {fmtMoney(m.unit_price)}
                </div>
              </div>
              <div className="flex shrink-0 items-center">{renderRight(m)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
