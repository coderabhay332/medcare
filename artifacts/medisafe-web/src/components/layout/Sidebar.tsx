import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  PlusCircle,
  ShieldCheck,
  User,
  LogOut,
  Pill,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",    href: "/" },
  { icon: PlusCircle,      label: "Add Medicine", href: "/add-medicine" },
  { icon: ShieldCheck,     label: "Safety Check", href: "/check" },
  { icon: User,            label: "My Profile",   href: "/profile" },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-7">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shadow-sm">
            <Pill className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <div>
            <p
              className="font-bold text-sidebar-foreground tracking-tight leading-none"
              style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "1.05rem" }}
            >
              MediSafe
            </p>
            <p className="text-[9px] text-sidebar-foreground/40 uppercase tracking-[0.2em] mt-0.5">
              Drug Safety
            </p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-sidebar-border/60 mb-5" />

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item, i) => {
          const active = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <item.icon className={cn(
                "w-[17px] h-[17px] shrink-0 transition-transform group-hover:scale-110",
                active ? "text-sidebar-primary-foreground" : ""
              )} />
              <span className="tracking-tight">{item.label}</span>
              {active && (
                <div className="ml-auto w-1 h-1 rounded-full bg-sidebar-primary-foreground/60" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="p-3 mt-auto">
        <div className="rounded-lg bg-sidebar-accent/60 border border-sidebar-border p-3 mb-2">
          <div className="flex items-center gap-2.5 mb-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground shrink-0"
              style={{ background: "hsl(42 90% 52%)" }}
            >
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-sidebar-foreground/80 truncate">{user?.name}</p>
              <p className="text-[10px] text-sidebar-foreground/35 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-medium text-sidebar-foreground/40 hover:text-red-400 hover:bg-red-400/10 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-sidebar-primary flex items-center justify-center">
            <Pill className="w-3.5 h-3.5 text-sidebar-primary-foreground" />
          </div>
          <span
            className="font-bold text-sidebar-foreground"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            MediSafe
          </span>
        </div>
        <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60">
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 bg-sidebar flex flex-col border-r border-sidebar-border shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50"
            >
              <X className="w-4 h-4" />
            </button>
            <NavContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-sidebar-border bg-sidebar min-h-screen">
        <NavContent />
      </aside>
    </>
  );
}
