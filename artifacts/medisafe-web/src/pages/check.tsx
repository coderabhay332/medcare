import { useState, useEffect } from "react";
import { api, type PatientProfile, type CheckResponse, type CheckResultItem } from "@/lib/api";
import {
  ShieldCheck,
  Shield,
  AlertTriangle,
  X,
  Loader2,
  CheckCircle,
  Pill,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG = {
  none: {
    label: "Safe",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    icon: CheckCircle,
  },
  mild: {
    label: "Mild Interaction",
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    icon: AlertTriangle,
  },
  moderate: {
    label: "Moderate Interaction",
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
    icon: AlertTriangle,
  },
  severe: {
    label: "Severe Interaction",
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
    icon: X,
  },
};

export default function CheckPage() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [medicines, setMedicines] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.patient.getProfile()
      .then((p) => {
        setProfile(p);
        setMedicines(p.medications?.map((m) => m.name) ?? []);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, []);

  const addMed = () => {
    const val = input.trim();
    if (val && !medicines.includes(val)) {
      setMedicines((m) => [...m, val]);
    }
    setInput("");
  };

  const removeMed = (name: string) => setMedicines((m) => m.filter((x) => x !== name));

  const runCheck = async () => {
    if (medicines.length < 2) return setError("Add at least 2 medicines to check interactions.");
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const r = await api.check.run({ medicines });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Safety Check</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Check your medicines for dangerous interactions and banned formulations
        </p>
      </div>

      {/* Medicine list builder */}
      <div className="bg-card border border-card-border rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-sm">Medicines to check</h2>
          {profileLoading && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMed())}
            placeholder="Type medicine name and press Enter…"
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
          <button
            onClick={addMed}
            className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {medicines.length > 0 ? (
          <div className="space-y-2">
            {medicines.map((name) => (
              <div key={name} className="flex items-center gap-3 px-3.5 py-2.5 bg-muted rounded-xl">
                <Pill className="w-4 h-4 text-primary shrink-0" />
                <span className="flex-1 text-sm font-medium text-foreground">{name}</span>
                <button onClick={() => removeMed(name)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Your saved medicines will appear here. Add more above.
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <button
        onClick={runCheck}
        disabled={loading || medicines.length < 2}
        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-xl font-semibold shadow-sm hover:opacity-90 disabled:opacity-60 transition-all"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Analysing interactions…</>
        ) : (
          <><ShieldCheck className="w-4 h-4" /> Run Safety Check</>
        )}
      </button>

      {/* Results */}
      {result && <CheckResults result={result} />}
    </div>
  );
}

function CheckResults({ result }: { result: CheckResponse }) {
  const overallSev = result.results.reduce<"none" | "mild" | "moderate" | "severe">((worst, r) => {
    const order = { none: 0, mild: 1, moderate: 2, severe: 3 };
    return order[r.severity] > order[worst] ? r.severity : worst;
  }, "none");

  const topConfig = SEVERITY_CONFIG[result.overallSafe ? "none" : (overallSev === "none" ? "mild" : overallSev)];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Overall verdict */}
      <div className={cn("p-5 rounded-2xl border-2", topConfig.bg, topConfig.border)}>
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", topConfig.bg)}>
            {result.overallSafe ? (
              <ShieldCheck className={cn("w-5 h-5", topConfig.color)} />
            ) : (
              <Shield className={cn("w-5 h-5", topConfig.color)} />
            )}
          </div>
          <div>
            <p className={cn("font-bold", topConfig.color)}>
              {result.overallSafe ? "Combination appears safe" : "Caution advised"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Based on 4-layer safety analysis</p>
          </div>
        </div>
        {result.summary && (
          <p className="mt-3 text-sm text-foreground/80 leading-relaxed border-t border-current/10 pt-3">
            {result.summary}
          </p>
        )}
      </div>

      {/* Banned FDCs */}
      {result.bannedFound.length > 0 && (
        <div className="p-4 rounded-2xl border-2 bg-destructive/10 border-destructive/30">
          <div className="flex items-center gap-2 mb-3">
            <X className="w-4.5 h-4.5 text-destructive" />
            <p className="font-semibold text-destructive text-sm">Banned FDC Formulations Detected</p>
          </div>
          <div className="space-y-1.5">
            {result.bannedFound.map((b) => (
              <div key={b} className="flex items-center gap-2 px-3 py-2 bg-white/50 rounded-lg text-sm text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {b}
              </div>
            ))}
          </div>
          <p className="text-xs text-destructive/70 mt-2">
            These are banned by the Ministry of Health & Family Welfare. Do not use.
          </p>
        </div>
      )}

      {/* Organ warnings */}
      {result.organWarnings.length > 0 && (
        <div className="p-4 rounded-2xl border border-orange-200 bg-orange-50">
          <p className="font-semibold text-orange-700 text-sm mb-2">Organ-specific warnings</p>
          <ul className="space-y-1.5">
            {result.organWarnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-orange-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pair interactions */}
      {result.results.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-foreground">Interaction details</h3>
          {result.results.map((item, i) => (
            <InteractionCard key={i} item={item} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pb-2">
        This analysis is for informational purposes only. Always consult a licensed physician or pharmacist.
      </p>
    </div>
  );
}

function InteractionCard({ item }: { item: CheckResultItem }) {
  const cfg = SEVERITY_CONFIG[item.severity];
  const Icon = cfg.icon;

  return (
    <div className={cn("p-4 rounded-xl border", cfg.bg, cfg.border)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", cfg.color)} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn("text-sm font-semibold", cfg.color)}>{cfg.label}</p>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground font-medium">{item.pair.join(" + ")}</span>
          </div>
          {item.reason && (
            <p className="text-xs text-foreground/70 mt-1.5 leading-relaxed">{item.reason}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wide">
            Source: {item.source}
          </p>
        </div>
      </div>
    </div>
  );
}
