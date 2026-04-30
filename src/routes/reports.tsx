import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import {
  TrendingUp,
  Receipt,
  Wallet,
  CalendarDays,
  Download,
  FileSpreadsheet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/format";
import type { BillItem } from "@/lib/pos";

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  grand_total: number;
  discount_total: number;
  items: BillItem[];
  created_at: string;
}

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — MediPOS" },
      { name: "description", content: "Sales analytics, top medicines, and exportable reports for your pharmacy." },
    ],
  }),
  component: ReportsPage,
});

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function ReportsPage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(todayIso());

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", "reports", from, to],
    queryFn: async (): Promise<Invoice[]> => {
      const start = `${from}T00:00:00.000Z`;
      const end = `${to}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, grand_total, discount_total, items, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        grand_total: Number(r.grand_total),
        discount_total: Number(r.discount_total),
        items: r.items as unknown as BillItem[],
      }));
    },
  });

  // ── KPIs ────────────────────────────────────────────────────
  const todayKey = todayIso();
  const monthKey = todayKey.slice(0, 7);
  const { totalRev, totalCount, todayRev, monthRev, totalDiscount } = useMemo(() => {
    let totalRev = 0,
      totalDiscount = 0,
      todayRev = 0,
      monthRev = 0;
    for (const inv of invoices) {
      totalRev += inv.grand_total;
      totalDiscount += inv.discount_total;
      const d = inv.created_at.slice(0, 10);
      if (d === todayKey) todayRev += inv.grand_total;
      if (d.slice(0, 7) === monthKey) monthRev += inv.grand_total;
    }
    return { totalRev, totalCount: invoices.length, todayRev, monthRev, totalDiscount };
  }, [invoices, todayKey, monthKey]);

  // ── Daily series ────────────────────────────────────────────
  const dailySeries = useMemo(() => {
    const map = new Map<string, { date: string; revenue: number; count: number }>();
    // ensure every date in range exists for clean chart
    const start = new Date(from);
    const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      map.set(k, { date: k, revenue: 0, count: 0 });
    }
    for (const inv of invoices) {
      const k = inv.created_at.slice(0, 10);
      const e = map.get(k) ?? { date: k, revenue: 0, count: 0 };
      e.revenue += inv.grand_total;
      e.count += 1;
      map.set(k, e);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [invoices, from, to]);

  // ── Top medicines ───────────────────────────────────────────
  const topMedicines = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const inv of invoices) {
      for (const it of inv.items ?? []) {
        const key = it.name.trim();
        const e = agg.get(key) ?? { name: key, qty: 0, revenue: 0 };
        e.qty += it.qty;
        e.revenue += it.qty * it.unitPrice * (1 - it.discountPct / 100);
        agg.set(key, e);
      }
    }
    return Array.from(agg.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [invoices]);

  // ── Monthly summary ─────────────────────────────────────────
  const monthlySummary = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; invoices: number; discount: number }>();
    for (const inv of invoices) {
      const m = inv.created_at.slice(0, 7);
      const e = map.get(m) ?? { month: m, revenue: 0, invoices: 0, discount: 0 };
      e.revenue += inv.grand_total;
      e.invoices += 1;
      e.discount += inv.discount_total;
      map.set(m, e);
    }
    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [invoices]);

  // ── Exports ─────────────────────────────────────────────────
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        invoices.map((i) => ({
          invoice_number: i.invoice_number,
          date: new Date(i.created_at).toLocaleString(),
          customer: i.customer_name ?? "",
          items: i.items?.length ?? 0,
          discount: i.discount_total,
          total: i.grand_total,
        })),
      ),
      "Invoices",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailySeries), "Daily");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(topMedicines), "Top Medicines");
    XLSX.writeFile(wb, `medipos-report-${from}-to-${to}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("MediPOS — Sales Report", 14, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Period: ${from} → ${to}`, 14, 25);

    let y = 35;
    doc.setFont("helvetica", "bold");
    doc.text("Summary", 14, y);
    doc.setFont("helvetica", "normal");
    y += 7;
    const kpis = [
      ["Total revenue", fmtMoney(totalRev)],
      ["Today revenue", fmtMoney(todayRev)],
      ["Month revenue", fmtMoney(monthRev)],
      ["Total invoices", String(totalCount)],
      ["Total discount", fmtMoney(totalDiscount)],
    ];
    for (const [k, v] of kpis) {
      doc.text(k, 14, y);
      doc.text(v, 90, y);
      y += 6;
    }

    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text("Top Medicines", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text("Medicine", 14, y);
    doc.text("Qty", 120, y);
    doc.text("Revenue", 160, y);
    y += 5;
    for (const m of topMedicines) {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(m.name.slice(0, 60), 14, y);
      doc.text(String(m.qty), 120, y);
      doc.text(fmtMoney(m.revenue), 160, y);
      y += 5;
    }
    doc.save(`medipos-report-${from}-to-${to}.pdf`);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sales analytics & exports.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="from" className="text-xs uppercase tracking-wide text-muted-foreground">
              From
            </Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-40" />
          </div>
          <div>
            <Label htmlFor="to" className="text-xs uppercase tracking-wide text-muted-foreground">
              To
            </Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-40" />
          </div>
          <Button variant="outline" onClick={exportPdf}>
            <Download className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Today's Sales" value={fmtMoney(todayRev)} />
        <Kpi icon={<CalendarDays className="h-4 w-4" />} label="This Month" value={fmtMoney(monthRev)} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Total Revenue" value={fmtMoney(totalRev)} hint={`${from} → ${to}`} />
        <Kpi icon={<Receipt className="h-4 w-4" />} label="Total Invoices" value={String(totalCount)} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Sales trend</h2>
          {isLoading ? (
            <div className="mt-6 h-56 animate-pulse rounded bg-muted" />
          ) : (
            <LineChart data={dailySeries} />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Top medicines</h2>
          {topMedicines.length === 0 ? (
            <div className="mt-10 text-center text-sm text-muted-foreground">No sales in this period.</div>
          ) : (
            <BarChart data={topMedicines} />
          )}
        </Card>
      </div>

      {/* Tables */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Monthly summary
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Month</th>
                <th className="px-4 py-2 text-right">Invoices</th>
                <th className="px-4 py-2 text-right">Discount</th>
                <th className="px-4 py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No data
                  </td>
                </tr>
              ) : (
                monthlySummary.map((m) => (
                  <tr key={m.month} className="border-t border-border">
                    <td className="px-4 py-2 font-mono">{m.month}</td>
                    <td className="px-4 py-2 text-right font-mono">{m.invoices}</td>
                    <td className="px-4 py-2 text-right font-mono text-destructive">−{fmtMoney(m.discount)}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold">{fmtMoney(m.revenue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Daily sales
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-right">Invoices</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {dailySeries.slice().reverse().map((d) => (
                  <tr key={d.date} className="border-t border-border">
                    <td className="px-4 py-2 font-mono">{d.date}</td>
                    <td className="px-4 py-2 text-right font-mono">{d.count}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtMoney(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

/* Lightweight pure-SVG charts (no recharts dependency) */
function LineChart({ data }: { data: { date: string; revenue: number }[] }) {
  const W = 560;
  const H = 220;
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = pad.l + i * stepX;
    const y = pad.t + innerH - (d.revenue / max) * innerH;
    return { x, y, ...d };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L${points[points.length - 1]?.x ?? pad.l},${pad.t + innerH} L${pad.l},${pad.t + innerH} Z`;

  const yTicks = 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full">
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const y = pad.t + (i / yTicks) * innerH;
        const v = max - (i / yTicks) * max;
        return (
          <g key={i}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="currentColor" strokeOpacity={0.08} />
            <text x={pad.l - 4} y={y + 3} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.5}>
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      {points.length > 0 && (
        <>
          <path d={area} fill="hsl(var(--primary) / 0.15)" />
          <path d={path} fill="none" stroke="oklch(0.52 0.13 175)" strokeWidth={2} />
          {points.map((p) => (
            <circle key={p.date} cx={p.x} cy={p.y} r={2.5} fill="oklch(0.52 0.13 175)">
              <title>{`${p.date}: ${p.revenue.toFixed(2)}`}</title>
            </circle>
          ))}
        </>
      )}
      {data.length > 0 && (
        <>
          <text x={pad.l} y={H - 6} fontSize={9} fill="currentColor" opacity={0.6}>
            {data[0].date.slice(5)}
          </text>
          <text x={W - pad.r} y={H - 6} fontSize={9} textAnchor="end" fill="currentColor" opacity={0.6}>
            {data[data.length - 1].date.slice(5)}
          </text>
        </>
      )}
    </svg>
  );
}

function BarChart({ data }: { data: { name: string; revenue: number; qty: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  return (
    <div className="mt-4 space-y-2">
      {data.map((d) => (
        <div key={d.name} className="text-xs">
          <div className="flex items-center justify-between">
            <span className="truncate pr-2 font-medium" title={d.name}>
              {d.name}
            </span>
            <span className="font-mono text-muted-foreground">
              {d.qty}× · {fmtMoney(d.revenue)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(d.revenue / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
