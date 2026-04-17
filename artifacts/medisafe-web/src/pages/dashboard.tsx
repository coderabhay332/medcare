import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { api, type PatientProfile } from "@/lib/api";
import {
  ShieldCheck,
  PlusCircle,
  Pill,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  User,
  Activity,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.patient.getProfile()
      .then(setProfile)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex-1 p-6 md:p-8 space-y-8 max-w-5xl">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <h1 className="text-2xl font-bold text-foreground">{user?.name?.split(" ")[0] ?? "User"} 👋</h1>
        <p className="text-muted-foreground text-sm">Here's your medicine safety overview</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Medicines",
                value: profile?.medications?.length ?? 0,
                icon: Pill,
                color: "text-primary bg-primary/10",
              },
              {
                label: "Conditions",
                value: profile?.conditions?.length ?? 0,
                icon: Activity,
                color: "text-chart-2 bg-chart-2/10",
              },
              {
                label: "Allergies",
                value: profile?.allergies?.length ?? 0,
                icon: AlertTriangle,
                color: "text-chart-4 bg-chart-4/10",
              },
              {
                label: "Profile",
                value: "Active",
                icon: User,
                color: "text-chart-5 bg-chart-5/10",
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border border-card-border rounded-2xl p-4 shadow-xs">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", stat.color)}>
                  <stat.icon className="w-4.5 h-4.5" />
                </div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid md:grid-cols-2 gap-4">
            <Link href="/check" className="group flex items-center gap-4 p-5 bg-primary rounded-2xl shadow-sm hover:opacity-95 transition-all active:scale-[0.98]">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-white">Run Safety Check</p>
                  <p className="text-white/70 text-xs mt-0.5">Check your medicines for interactions</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/70 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href="/add-medicine" className="group flex items-center gap-4 p-5 bg-card border border-card-border rounded-2xl shadow-xs hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.98]">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <PlusCircle className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Add Medicine</p>
                  <p className="text-muted-foreground text-xs mt-0.5">Search, scan, or enter manually</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Current medicines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Current Medicines</h2>
              <Link href="/add-medicine" className="text-xs text-primary font-medium hover:underline">+ Add more</Link>
            </div>
            {!profile?.medications?.length ? (
              <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
                <Pill className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No medicines added yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Add your medicines to get personalised safety checks</p>
                <Link href="/add-medicine" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all">
                  <PlusCircle className="w-3.5 h-3.5" /> Add your first medicine
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {profile.medications.map((med) => (
                  <div key={med._id} className="flex items-center gap-4 p-4 bg-card border border-card-border rounded-xl shadow-xs hover:border-primary/30 transition-all">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Pill className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{med.name}</p>
                      {med.salt && <p className="text-xs text-muted-foreground truncate">{med.salt}</p>}
                    </div>
                    {med.dosage && (
                      <span className="text-xs bg-accent text-accent-foreground px-2.5 py-1 rounded-full font-medium">
                        {med.dosage}
                      </span>
                    )}
                    <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Conditions & Allergies */}
          {((profile?.conditions?.length ?? 0) > 0 || (profile?.allergies?.length ?? 0) > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              {profile?.conditions && profile.conditions.length > 0 && (
                <div className="bg-card border border-card-border rounded-2xl p-4 shadow-xs">
                  <h3 className="font-semibold text-sm text-foreground mb-3">Medical Conditions</h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.conditions.map((c) => (
                      <span key={c} className="px-2.5 py-1 bg-chart-2/10 text-chart-2 border border-chart-2/20 rounded-full text-xs font-medium">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {profile?.allergies && profile.allergies.length > 0 && (
                <div className="bg-card border border-card-border rounded-2xl p-4 shadow-xs">
                  <h3 className="font-semibold text-sm text-foreground mb-3">Known Allergies</h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.allergies.map((a) => (
                      <span key={a} className="px-2.5 py-1 bg-destructive/10 text-destructive border border-destructive/20 rounded-full text-xs font-medium">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
