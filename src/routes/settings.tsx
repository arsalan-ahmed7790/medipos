import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  DEFAULT_SETTINGS,
  type FontSize,
  type PaperWidth,
  type StoreSettings,
  useSaveSettings,
  useSettings,
} from "@/lib/settings";
import { ReceiptPreview } from "@/components/pos/ReceiptPreview";
import { storeFromSettings } from "@/lib/pos";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MediPOS" },
      { name: "description", content: "Customize store info, receipt layout, and printer paper width." },
    ],
  }),
  component: SettingsPage,
});

const SAMPLE_ITEMS = [
  { id: "1", name: "Paracetamol 500mg", qty: 2, unitPrice: 50, discountPct: 0 },
  { id: "2", name: "Amoxicillin 250mg Capsule Long Name", qty: 1, unitPrice: 120, discountPct: 10 },
  { id: "3", name: "Cough Syrup 100ml", qty: 1, unitPrice: 85, discountPct: 0 },
];

function SettingsPage() {
  const { data, isLoading } = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<StoreSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    try {
      await save.mutateAsync(form);
      toast.success("Settings saved");
    } catch (e) {
      toast.error("Failed to save", { description: (e as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Customize the store details, receipt layout, and printer paper size.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_auto]">
        {/* FORM */}
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Store information
            </h2>
            <div className="mt-4 grid gap-4">
              <div>
                <Label htmlFor="store_name">Store name</Label>
                <Input
                  id="store_name"
                  className="mt-1.5"
                  value={form.store_name}
                  onChange={(e) => set("store_name", e.target.value)}
                  maxLength={60}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="address_line">Address</Label>
                  <Input
                    id="address_line"
                    className="mt-1.5"
                    value={form.address_line ?? ""}
                    onChange={(e) => set("address_line", e.target.value)}
                    maxLength={120}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    className="mt-1.5"
                    value={form.phone ?? ""}
                    onChange={(e) => set("phone", e.target.value)}
                    maxLength={40}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="footer">Footer message</Label>
                <Textarea
                  id="footer"
                  className="mt-1.5"
                  rows={2}
                  value={form.footer ?? ""}
                  onChange={(e) => set("footer", e.target.value)}
                  maxLength={200}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Receipt layout
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Paper width</Label>
                <Select
                  value={form.paper_width}
                  onValueChange={(v) => set("paper_width", v as PaperWidth)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58mm">58mm (small thermal)</SelectItem>
                    <SelectItem value="80mm">80mm (standard thermal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Font size</Label>
                <Select
                  value={form.font_size}
                  onValueChange={(v) => set("font_size", v as FontSize)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <ToggleRow
                label="Show unit price column"
                checked={form.show_unit_price}
                onChange={(v) => set("show_unit_price", v)}
              />
              <ToggleRow
                label="Show discount details"
                checked={form.show_discount}
                onChange={(v) => set("show_discount", v)}
              />
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isLoading || save.isPending}>
              <Save className="h-4 w-4" />
              {save.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>

        {/* PREVIEW */}
        <Card className="h-fit p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            <Eye className="h-4 w-4" /> Live preview
          </div>
          <div className="flex justify-center">
            <ReceiptPreview
              store={storeFromSettings(form)}
              items={SAMPLE_ITEMS}
              invoiceNumber="INV-PREVIEW-0001"
              customerName="Sample Customer"
              paperWidth={form.paper_width}
              fontSize={form.font_size}
              showDiscount={form.show_discount}
              showUnitPrice={form.show_unit_price}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
