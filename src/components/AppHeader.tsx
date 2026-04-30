import { Link } from "@tanstack/react-router";
import { Pill, Receipt, Package, Boxes, History, BarChart3, Settings } from "lucide-react";

export function AppHeader() {
  return (
    <header className="no-print sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Pill className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">MediPOS</div>
            <div className="text-[11px] text-muted-foreground">Pharmacy Billing System</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/" icon={<Receipt className="h-4 w-4" />} label="Billing" />
          <NavLink to="/inventory" icon={<Boxes className="h-4 w-4" />} label="Inventory" />
          <NavLink to="/medicines" icon={<Package className="h-4 w-4" />} label="Medicines" />
          <NavLink to="/history" icon={<History className="h-4 w-4" />} label="History" />
          <NavLink to="/reports" icon={<BarChart3 className="h-4 w-4" />} label="Reports" />
          <NavLink to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
        </nav>
      </div>
    </header>
  );
}

function NavLink({ to, icon, label }: { to: "/" | "/inventory" | "/medicines" | "/history" | "/reports" | "/settings"; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      activeProps={{ className: "bg-primary/10 text-primary" }}
      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {icon}
      {label}
    </Link>
  );
}
