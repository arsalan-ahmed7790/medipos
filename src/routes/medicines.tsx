import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Edit3, Check, X, Upload, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/format";
import { ImportDialog } from "@/components/medicines/ImportDialog";

interface Medicine {
  id: string;
  name: string;
  generic_name: string | null;
  unit_price: number;
  purchase_price: number;
  stock: number;
  category: string | null;
  low_stock_threshold: number;
  expiry_date: string | null;
  batch_number: string | null;
}

export const Route = createFileRoute("/medicines")({
  head: () => ({
    meta: [
      { title: "Medicines — MediPOS" },
      { name: "description", content: "Manage the pharmacy's medicine catalog: add, edit, delete, bulk import." },
    ],
  }),
  component: MedicinesPage,
});

const initialForm = {
  name: "",
  generic: "",
  category: "",
  price: "",
  cost: "",
  stock: "",
  threshold: "",
  expiry: "",
  batch: "",
};

function MedicinesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [showLowOnly, setShowLowOnly] = useState(false);

  const setField = <K extends keyof typeof initialForm>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const { data: meds = [], isLoading } = useQuery({
    queryKey: ["medicines"],
    queryFn: async (): Promise<Medicine[]> => {
      const { data, error } = await supabase
        .from("medicines")
        .select(
          "id, name, generic_name, unit_price, purchase_price, stock, category, low_stock_threshold, expiry_date, batch_number",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []).map((m) => ({
        ...m,
        unit_price: Number(m.unit_price),
        purchase_price: Number(m.purchase_price),
        category: m.category ?? null,
      }));
    },
  });

  const reset = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const upsert = useMutation({
    mutationFn: async () => {
      const trimmed = form.name.trim();
      const p = Number(form.price);
      const c = Number(form.cost || "0");
      const s = Number(form.stock || "0");
      const t = Number(form.threshold || "10");
      if (!trimmed) throw new Error("Name required");
      if (!Number.isFinite(p) || p < 0) throw new Error("Invalid selling price");
      if (!Number.isFinite(c) || c < 0) throw new Error("Invalid purchase price");
      if (!Number.isFinite(s) || s < 0) throw new Error("Invalid stock");

      const payload = {
        name: trimmed,
        generic_name: form.generic.trim() || null,
        unit_price: p,
        purchase_price: c,
        stock: s,
        category: form.category.trim() || null,
        low_stock_threshold: t,
        expiry_date: form.expiry || null,
        batch_number: form.batch.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase.from("medicines").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("medicines").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Updated" : "Added");
      reset();
      qc.invalidateQueries({ queryKey: ["medicines"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("medicines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["medicines"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  let filtered = meds.filter((m) => {
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      (m.generic_name ?? "").toLowerCase().includes(q) ||
      (m.category ?? "").toLowerCase().includes(q)
    );
  });
  if (showLowOnly) filtered = filtered.filter((m) => m.stock <= m.low_stock_threshold);

  const lowStockCount = meds.filter((m) => m.stock <= m.low_stock_threshold).length;
  const existingNames = new Set(meds.map((m) => m.name.toLowerCase()));

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Medicines</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catalog used for billing autocomplete. Stock auto-updates after each sale.
          </p>
        </div>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Import CSV / Excel
        </Button>
      </div>

      <Card className="mt-6 p-5">
        <div className="grid gap-4 md:grid-cols-12">
          <div className="md:col-span-4">
            <Label htmlFor="m-name">Name *</Label>
            <Input id="m-name" className="mt-1.5" value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Paracetamol 500mg" maxLength={120} />
          </div>
          <div className="md:col-span-4">
            <Label htmlFor="m-generic">Generic name</Label>
            <Input id="m-generic" className="mt-1.5" value={form.generic}
              onChange={(e) => setField("generic", e.target.value)}
              placeholder="Acetaminophen" maxLength={120} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="m-cat">Category</Label>
            <Input id="m-cat" className="mt-1.5" value={form.category}
              onChange={(e) => setField("category", e.target.value)}
              placeholder="Tablet" maxLength={40} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="m-batch">Batch #</Label>
            <Input id="m-batch" className="mt-1.5" value={form.batch}
              onChange={(e) => setField("batch", e.target.value)}
              placeholder="B12345" maxLength={40} />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="m-cost">Purchase price</Label>
            <Input id="m-cost" className="mt-1.5" type="number" step="0.01" min={0}
              value={form.cost} onChange={(e) => setField("cost", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="m-price">Selling price *</Label>
            <Input id="m-price" className="mt-1.5" type="number" step="0.01" min={0}
              value={form.price} onChange={(e) => setField("price", e.target.value)} />
          </div>
          <div className="md:col-span-1">
            <Label htmlFor="m-stock">Stock</Label>
            <Input id="m-stock" className="mt-1.5" type="number" min={0}
              value={form.stock} onChange={(e) => setField("stock", e.target.value)} />
          </div>
          <div className="md:col-span-1">
            <Label htmlFor="m-th">Low @</Label>
            <Input id="m-th" className="mt-1.5" type="number" min={0}
              value={form.threshold} onChange={(e) => setField("threshold", e.target.value)}
              placeholder="10" />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="m-exp">Expiry date</Label>
            <Input id="m-exp" className="mt-1.5" type="date"
              value={form.expiry} onChange={(e) => setField("expiry", e.target.value)} />
          </div>
          <div className="flex items-end gap-2 md:col-span-3">
            <Button onClick={() => upsert.mutate()} className="w-full" disabled={upsert.isPending}>
              {editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Update medicine" : "Add medicine"}
            </Button>
            {editingId && (
              <Button variant="ghost" size="icon" onClick={reset} title="Cancel">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Input placeholder="Search name, generic or category…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="w-72" />
          {lowStockCount > 0 && (
            <button
              type="button"
              onClick={() => setShowLowOnly((v) => !v)}
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (showLowOnly
                  ? "border-warning bg-warning/15 text-warning-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted")
              }
            >
              <AlertTriangle className="h-3 w-3" />
              {lowStockCount} low stock
            </button>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} medicines</span>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="w-28 px-4 py-3 text-right">Price</th>
              <th className="w-28 px-4 py-3 text-right">Stock</th>
              <th className="w-32 px-4 py-3 text-left">Expiry</th>
              <th className="w-24 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No medicines.</td></tr>
            ) : (
              filtered.map((m) => {
                const out = m.stock === 0;
                const low = !out && m.stock <= m.low_stock_threshold;
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.name}</div>
                      {m.generic_name && (
                        <div className="text-xs text-muted-foreground">{m.generic_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.category ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMoney(m.unit_price)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="font-mono">{m.stock}</span>
                        {out ? (
                          <Badge variant="outline" className="border-destructive text-destructive">
                            out
                          </Badge>
                        ) : low ? (
                          <Badge variant="outline" className="border-warning text-warning">
                            low
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {m.expiry_date ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(m.id);
                            setForm({
                              name: m.name,
                              generic: m.generic_name ?? "",
                              category: m.category ?? "",
                              price: String(m.unit_price),
                              cost: String(m.purchase_price),
                              stock: String(m.stock),
                              threshold: String(m.low_stock_threshold),
                              expiry: m.expiry_date ?? "",
                              batch: m.batch_number ?? "",
                            });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Delete "${m.name}"?`)) remove.mutate(m.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existingNames={existingNames}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ["medicines"] });
          qc.invalidateQueries({ queryKey: ["inventory"] });
        }}
      />
    </div>
  );
}
