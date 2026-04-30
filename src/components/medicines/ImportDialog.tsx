// Bulk import medicines from CSV / XLSX with preview, validation, and dedupe.
import { useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, AlertCircle, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: Set<string>; // lower-cased
  onImported: () => void;
}

interface ParsedRow {
  name: string;
  unit_price: number;
  stock: number;
  category: string | null;
  __error?: string;
  __duplicate?: boolean;
}

type DuplicateMode = "update" | "skip";

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  medicine: "name",
  product: "name",
  price: "price",
  unit_price: "price",
  unitprice: "price",
  rate: "price",
  mrp: "price",
  stock: "stock",
  qty: "stock",
  quantity: "stock",
  category: "category",
  type: "category",
};

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function mapRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    const std = HEADER_ALIASES[normalizeKey(k)];
    if (std) out[std] = raw[k];
  }
  return out;
}

export function ImportDialog({ open, onOpenChange, existingNames, onImported }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [filename, setFilename] = useState("");
  const [dupMode, setDupMode] = useState<DuplicateMode>("update");
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setRows([]);
    setFilename("");
  };

  const handleFile = async (file: File) => {
    setFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      if (json.length === 0) {
        toast.error("File is empty");
        return;
      }

      const seen = new Set<string>();
      const parsed: ParsedRow[] = json.map((raw) => {
        const m = mapRow(raw);
        const name = String(m.name ?? "").trim();
        const priceStr = String(m.price ?? "").trim();
        const stockStr = String(m.stock ?? "").trim();
        const category = (String(m.category ?? "").trim() || null) as string | null;

        const unit_price = Number(priceStr);
        const stock = stockStr === "" ? 0 : Number(stockStr);

        let error: string | undefined;
        if (!name) error = "Missing name";
        else if (!Number.isFinite(unit_price) || unit_price < 0)
          error = "Invalid price";
        else if (!Number.isFinite(stock) || stock < 0) error = "Invalid stock";

        const lower = name.toLowerCase();
        const duplicateInFile = seen.has(lower);
        if (!error) seen.add(lower);

        return {
          name,
          unit_price: Number.isFinite(unit_price) ? unit_price : 0,
          stock: Number.isFinite(stock) ? stock : 0,
          category,
          __error: error ?? (duplicateInFile ? "Duplicate row in file" : undefined),
          __duplicate: existingNames.has(lower),
        };
      });

      setRows(parsed);
      const valid = parsed.filter((r) => !r.__error).length;
      toast.success(`Parsed ${parsed.length} rows · ${valid} valid`);
    } catch (e) {
      toast.error("Failed to read file", { description: (e as Error).message });
    }
  };

  const validRows = rows.filter((r) => !r.__error);
  const duplicates = validRows.filter((r) => r.__duplicate);
  const newRows = validRows.filter((r) => !r.__duplicate);
  const errorCount = rows.length - validRows.length;

  const doImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const toInsert = newRows.map((r) => ({
        name: r.name,
        unit_price: r.unit_price,
        stock: r.stock,
        category: r.category,
      }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("medicines").insert(toInsert);
        if (error) throw error;
      }

      if (dupMode === "update" && duplicates.length > 0) {
        // Look up IDs by name (case-insensitive) one batch at a time.
        const names = duplicates.map((d) => d.name);
        const { data: existing, error: fetchErr } = await supabase
          .from("medicines")
          .select("id, name")
          .in("name", names);
        if (fetchErr) throw fetchErr;
        const idByName = new Map(
          (existing ?? []).map((m) => [m.name.toLowerCase(), m.id as string]),
        );

        for (const r of duplicates) {
          const id = idByName.get(r.name.toLowerCase());
          if (!id) continue;
          const { error } = await supabase
            .from("medicines")
            .update({
              unit_price: r.unit_price,
              stock: r.stock,
              category: r.category,
            })
            .eq("id", id);
          if (error) throw error;
        }
      }

      const skipped = dupMode === "skip" ? duplicates.length : 0;
      toast.success(
        `Imported ${newRows.length} new${
          dupMode === "update" ? `, updated ${duplicates.length}` : `, skipped ${skipped}`
        }`,
      );
      onImported();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error("Import failed", { description: (e as Error).message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Import Medicines
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or XLSX file with columns:{" "}
            <code className="rounded bg-muted px-1 text-[11px]">name</code>,{" "}
            <code className="rounded bg-muted px-1 text-[11px]">price</code>,{" "}
            <code className="rounded bg-muted px-1 text-[11px]">stock</code> (optional),{" "}
            <code className="rounded bg-muted px-1 text-[11px]">category</code> (optional).
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-6 py-12 text-center hover:bg-muted">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-medium">Click to choose a file</div>
            <div className="text-xs text-muted-foreground">.csv, .xlsx, .xls</div>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 px-3 py-2 text-xs">
              <span className="font-medium">{filename}</span>
              <Stat label="Total" value={rows.length} />
              <Stat label="New" value={newRows.length} tone="success" />
              <Stat label="Duplicates" value={duplicates.length} tone="warning" />
              <Stat label="Errors" value={errorCount} tone="destructive" />
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={reset}
              >
                Choose different file
              </Button>
            </div>

            {duplicates.length > 0 && (
              <div className="rounded-md border border-border p-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Duplicate handling
                </Label>
                <RadioGroup
                  value={dupMode}
                  onValueChange={(v) => setDupMode(v as DuplicateMode)}
                  className="mt-2 flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="dup-update" value="update" />
                    <Label htmlFor="dup-update" className="text-sm font-normal">
                      Update existing
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="dup-skip" value="skip" />
                    <Label htmlFor="dup-skip" className="text-sm font-normal">
                      Skip duplicates
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="max-h-80 overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-right">Price</th>
                    <th className="px-2 py-2 text-right">Stock</th>
                    <th className="px-2 py-2 text-left">Category</th>
                    <th className="w-24 px-2 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      className={
                        "border-t border-border " +
                        (r.__error
                          ? "bg-destructive/5"
                          : r.__duplicate
                            ? "bg-warning/10"
                            : "")
                      }
                    >
                      <td className="px-2 py-1.5">{r.name || <em className="text-muted-foreground">—</em>}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{r.unit_price.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{r.stock}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.category ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {r.__error ? (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <AlertCircle className="h-3 w-3" /> {r.__error}
                          </span>
                        ) : r.__duplicate ? (
                          <span className="text-warning">Duplicate</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-success">
                            <Check className="h-3 w-3" /> New
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={doImport}
            disabled={validRows.length === 0 || importing}
          >
            {importing ? "Importing…" : `Import ${validRows.length} rows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "destructive";
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className={"font-mono font-semibold " + cls}>{value}</span>
    </span>
  );
}
