import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { api, type PatientProfile, type CheckResponse, type CombinedDietaryResult } from "@/lib/api";
import {
  Shield,
  PlusCircle,
  Pill,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Loader2,
  UtensilsCrossed,
  X,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CombinedDietaryPanel } from "@/components/DietaryPanel";


export default function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Interaction state
  const [interactions, setInteractions] = useState<CheckResponse | null>(null);
  const [interactionsLoading, setInteractionsLoading] = useState(false);

  // Delete medicine state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteMedicine = async (medId: string) => {
    setDeletingId(medId);
    try {
      const updated = await api.patient.removeMedication(medId);
      // Invalidate interaction cache so next check is fresh
      localStorage.removeItem('interaction_check_key');
      localStorage.removeItem('interaction_check_data');
      setInteractions(null);
      setProfile(updated);
    } catch {
      // silently fail — user can retry
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  // Dietary advice state
  const [dietaryOpen, setDietaryOpen] = useState(false);
  const [dietaryAdvice, setDietaryAdvice] = useState<CombinedDietaryResult | null>(null);
  const [dietaryLoading, setDietaryLoading] = useState(false);

  // Ref guard — prevents StrictMode double-invocation from firing two checks
  const checkStarted = useRef(false);

  useEffect(() => {
    const CACHE_KEY = 'interaction_check_key';
    const CACHE_DATA = 'interaction_check_data';

    api.patient.getProfile()
      .then((p) => {
        setProfile(p);

        const medNames = p.medications?.map((m) => m.name) ?? [];
        if (medNames.length < 2) return;

        const fingerprint = [...medNames].sort().join('|');

        // ── Check localStorage cache FIRST ───────────────────────────────────
        try {
          const storedKey  = localStorage.getItem(CACHE_KEY);
          const storedData = localStorage.getItem(CACHE_DATA);
          if (storedKey === fingerprint && storedData) {
            setInteractions(JSON.parse(storedData) as CheckResponse);
            return; // Cache hit — no API call needed
          }
        } catch {
          // Corrupt cache — fall through to fresh check
        }

        // ── StrictMode guard — only one live API call per page load ──────────
        if (checkStarted.current) return;
        checkStarted.current = true;

        // ── Fresh check ──────────────────────────────────────────────────────
        setInteractionsLoading(true);
        api.check.run({ medicines: medNames })
          .then((result) => {
            setInteractions(result);
            try {
              localStorage.setItem(CACHE_KEY,  fingerprint);
              localStorage.setItem(CACHE_DATA, JSON.stringify(result));
            } catch { /* localStorage full */ }
          })
          .catch(() => {})
          .finally(() => setInteractionsLoading(false));
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const toggleDietary = async () => {
    setDietaryOpen((o) => !o);
    const medNames = profile?.medications?.map((m) => m.name) ?? [];
    if (!dietaryAdvice && !dietaryLoading && medNames.length > 0) {
      setDietaryLoading(true);
      try {
        // Build condition context from active (non-recovered) conditionRecords
        const conditionContext = (profile?.conditionRecords ?? [])
          .filter((r) => !r.resolvedAt && (r.foodsToAvoid.length > 0 || r.foodsToEat.length > 0))
          .map((r) => ({ condition: r.name, foodsToAvoid: r.foodsToAvoid, foodsToEat: r.foodsToEat }));
        const result = await api.medicines.getCombinedDietaryAdvice(medNames, conditionContext.length > 0 ? conditionContext : undefined);
        setDietaryAdvice(result);
      } catch {
        setDietaryAdvice({ medicines: medNames, avoid: [], safeToEat: [], mealSchedule: [], medicineTips: [], generalTips: [], cached: false });
      } finally {
        setDietaryLoading(false);
      }
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const hasInteractionWarnings = interactions && (!interactions.overallSafe || interactions.bannedFound.length > 0 || interactions.results.length > 0);
  const interactionSeverity = interactions?.results.reduce<"none" | "mild" | "moderate" | "severe">((worst, r) => {
    const order = { none: 0, mild: 1, moderate: 2, severe: 3 };
    return order[r.severity] > order[worst] ? r.severity : worst;
  }, "none");

  // Build safety lookup maps for medicine card coloring
  const interactionMedSet = new Set(
    interactions?.results.flatMap(r => [r.medicine, r.conflictsWith].filter(Boolean)) ?? []
  );
  const bannedMedSet = new Set(
    interactions?.bannedFound.flatMap(b => b.medicines) ?? []
  );
  const medCount = profile?.medications?.length ?? 0;
  const concernCount = (interactions?.results.length ?? 0) + (interactions?.bannedFound.length ?? 0);

  // Status line copy
  const statusLine = interactionsLoading
    ? `Checking your ${medCount} medicine${medCount !== 1 ? "s" : ""} for interactions…`
    : concernCount > 0
    ? `${medCount} medicine${medCount !== 1 ? "s" : ""} · ${concernCount} concern${concernCount !== 1 ? "s" : ""} to review`
    : interactions
    ? `${medCount} medicine${medCount !== 1 ? "s" : ""} · all looking fine`
    : medCount > 0
    ? `${medCount} medicine${medCount !== 1 ? "s" : ""} tracked`
    : "Add your first medicine to get started";

  return (
    <div className="flex-1 p-5 md:p-8 space-y-7 max-w-2xl">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="pt-1 space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{greeting}</p>
        <h1
          className="text-4xl font-bold text-foreground"
          style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: "-0.03em", fontVariationSettings: "'opsz' 40" }}
        >
          {user?.name?.split(" ")[0] ?? "there"} <span style={{ opacity: 0.7 }}>👋</span>
        </h1>
        {!loading && (
          <p className={cn(
            "text-sm font-medium mt-1.5",
            concernCount > 0 ? "text-amber-700" : "text-muted-foreground"
          )}>
            {concernCount > 0 && <span className="mr-1">⚠</span>}{statusLine}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      ) : (
        <>

          {/* ── Medicines ─────────────────────────────────────────────── */}
          <section className="space-y-3 reveal-up reveal-up-2">
            <div className="flex items-center justify-between">
              <h2
                className="text-[10px] font-semibold text-muted-foreground/70 uppercase"
                style={{ letterSpacing: "0.14em" }}
              >
                Your Medicines {medCount > 0 && `· ${medCount}`}
              </h2>
              <Link href="/add-medicine" className="flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-75 transition-opacity">
                <PlusCircle className="w-3.5 h-3.5" /> Add
              </Link>
            </div>

            {medCount === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center space-y-3">
                <Pill className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-foreground">No medicines yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Add your first medicine to start safety checks</p>
                </div>
                <Link href="/add-medicine" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all">
                  <PlusCircle className="w-3.5 h-3.5" /> Add Medicine
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {profile!.medications.map((med) => {
                  const isConfirming = confirmDeleteId === med._id;
                  const isDeleting   = deletingId === med._id;
                  const isBanned     = bannedMedSet.has(med.name);
                  const hasConcern   = interactionMedSet.has(med.name);
                  const concern      = interactions?.results.find(
                    r => r.medicine === med.name || r.conflictsWith === med.name
                  );
                  return (
                  <div className="rounded-xl border bg-card overflow-hidden transition-all duration-200 shadow-xs hover:shadow-sm"
                      style={{
                        borderLeft: isConfirming ? undefined
                          : isBanned ? "3px solid hsl(8 68% 48%)"
                          : hasConcern ? "3px solid hsl(38 85% 52%)"
                          : "3px solid hsl(158 52% 28% / 0.3)",
                        borderColor: isConfirming ? "hsl(8 68% 48% / 0.4)" : undefined,
                        background: isConfirming ? "hsl(8 68% 48% / 0.04)" : undefined,
                      }}
                  >
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="flex-1 min-w-0">
                          <p
                            className="font-semibold text-foreground text-sm leading-snug truncate"
                            style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: "-0.01em" }}
                          >{med.name}</p>
                          {med.salt && <p className="text-[11px] text-muted-foreground mt-0.5 truncate font-normal">{med.salt}</p>}
                        </div>

                        {med.dosage && !isConfirming && (
                          <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium shrink-0">
                            {med.dosage}
                          </span>
                        )}

                        {isConfirming ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-destructive font-medium">Remove?</span>
                            <button
                              onClick={() => handleDeleteMedicine(med._id)}
                              disabled={isDeleting}
                              className="px-2.5 py-1 rounded-lg bg-destructive text-white text-xs font-semibold hover:bg-destructive/90 disabled:opacity-60 transition-all"
                            >
                              {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)} className="p-1.5 rounded-lg hover:bg-muted">
                              <X className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(med._id)}
                            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Inline concern hint */}
                      {!isConfirming && hasConcern && concern && (
                        <div className="mx-4 mb-3 flex items-start gap-1.5 text-[11px] text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5">
                          <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                          <span className="line-clamp-2">{concern.reason}</span>
                        </div>
                      )}
                      {!isConfirming && isBanned && (
                        <div className="mx-4 mb-3 flex items-center gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                          <X className="w-3 h-3 shrink-0" />
                          This combination is banned in India — see Concerns below
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {interactionsLoading && medCount >= 2 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 pt-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking for interactions…
              </div>
            )}
          </section>

          {/* ── Concerns ───────────────────────────────────────────── */}
          {hasInteractionWarnings && interactions && (
            <section className="space-y-3 reveal-up reveal-up-3">
              <h2
                className="text-[10px] font-semibold uppercase text-amber-700/80 flex items-center gap-1.5"
                style={{ letterSpacing: "0.14em" }}
              >
                <AlertTriangle className="w-3 h-3" /> Concerns
              </h2>
              <InteractionBanner interactions={interactions} severity={interactionSeverity!} />
            </section>
          )}

          {/* ── Add Medicine CTA ───────────────────────────────────────── */}
          {medCount > 0 && (
            <Link
              href="/add-medicine"
              className="flex items-center gap-3 p-4 bg-card border border-dashed border-primary/25 rounded-xl text-primary hover:border-primary/50 hover:bg-primary/5 transition-all group reveal-up reveal-up-4"
            >
              <PlusCircle className="w-4.5 h-4.5" />
              <span className="text-sm font-medium">Add another medicine</span>
              <ChevronRight className="w-4 h-4 ml-auto opacity-40 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}

          {/* ── Combined Dietary & Food Guide ───────────────────────── */}
          {(profile?.medications?.length ?? 0) > 0 && (
            <div className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden">
              <button
                onClick={toggleDietary}
                className="w-full flex items-center gap-4 p-5 hover:bg-muted/50 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                  <UtensilsCrossed className="w-5 h-5 text-green-700" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-foreground text-sm">Diet & Food Guide</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    What to avoid and what's safe to eat with all your medicines
                  </p>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", dietaryOpen && "rotate-180")} />
              </button>

              {dietaryOpen && (
                <div className="border-t border-border animate-in fade-in slide-in-from-top-2 duration-200">
                  {dietaryLoading ? (
                    <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analysing dietary interactions for all your medicines…
                    </div>
                  ) : dietaryAdvice ? (
                    <CombinedDietaryPanel advice={dietaryAdvice} />
                  ) : null}
                </div>
              )}
            </div>
          )}

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

// ── Concerns List (clean expandable cards) ────────────────────────────────────
function InteractionBanner({
  interactions,
  severity,
}: {
  interactions: CheckResponse;
  severity: "none" | "mild" | "moderate" | "severe";
}) {
  const [expanded, setExpanded] = useState(false);
  const sevConfig = {
    none:     { bg: "bg-primary/5",      border: "border-primary/20",     text: "text-primary",     label: "Safe" },
    mild:     { bg: "bg-yellow-50",       border: "border-yellow-200",     text: "text-yellow-700",  label: "Mild" },
    moderate: { bg: "bg-orange-50",       border: "border-orange-200",     text: "text-orange-700",  label: "Moderate" },
    severe:   { bg: "bg-destructive/10",  border: "border-destructive/30", text: "text-destructive", label: "Severe" },
  }[severity];

  const isBanned = interactions.bannedFound.length > 0;
  const cfg = isBanned ? sevConfig : (severity === "none" ? sevConfig : sevConfig);

  return (
    <div className={cn("rounded-2xl border overflow-hidden", isBanned ? "bg-destructive/10 border-destructive/30" : cfg.bg, isBanned ? "" : cfg.border)}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {isBanned ? (
          <X className="w-4.5 h-4.5 text-destructive shrink-0" />
        ) : (
          <Shield className={cn("w-4.5 h-4.5 shrink-0", cfg.text)} />
        )}
        <div className="flex-1">
          <p className={cn("text-sm font-semibold", isBanned ? "text-destructive" : cfg.text)}>
            {isBanned
              ? `${interactions.bannedFound.length} banned combination${interactions.bannedFound.length > 1 ? "s" : ""} detected`
              : `${interactions.results.length} interaction${interactions.results.length > 1 ? "s" : ""} found in your medicines`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Tap to see details</p>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="border-t border-current/10 px-4 pb-4 space-y-3 animate-in fade-in duration-200">
          {/* Banned */}
          {interactions.bannedFound.map((b, i) => (
            <div key={i} className="flex flex-col gap-1 p-3 bg-white/60 rounded-xl border border-destructive/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {b.medicines.join(" + ")} — Banned FDC
              </div>
              <p className="text-xs text-destructive/80 leading-relaxed ml-5">{b.reason}</p>
            </div>
          ))}
          {/* Regular interactions */}
          {interactions.results.map((r, i) => {
            const sevColors = {
              none:     "text-primary bg-primary/10",
              mild:     "text-yellow-700 bg-yellow-50",
              moderate: "text-orange-700 bg-orange-50",
              severe:   "text-destructive bg-destructive/10",
            }[r.severity];
            return (
              <div key={i} className="flex flex-col gap-2 p-3 bg-white/60 rounded-xl border border-current/10">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", sevColors)}>{r.severity}</span>
                  <span className="text-xs font-medium text-foreground">{r.pair.join(" + ")}</span>
                </div>
                {/* Summary reason */}
                {r.reason && <p className="text-xs text-muted-foreground leading-relaxed">{r.reason}</p>}
                {/* Clinical problem */}
                {r.problem && (
                  <div className="flex gap-2 p-2 rounded-lg bg-orange-50 border border-orange-100">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-orange-800 leading-relaxed">{r.problem}</p>
                  </div>
                )}
                {/* Alternatives */}
                {r.alternatives && r.alternatives.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1.5">What you can do</p>
                    <ul className="space-y-1">
                      {r.alternatives.map((alt, j) => (
                        <li key={j} className="flex items-start gap-1.5 text-xs text-foreground/80 leading-relaxed">
                          <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                          {alt}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Source confidence badge */}
                {r.source && <DashboardSourceBadge source={r.source} />}
              </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground pt-1">
            This analysis is informational only. Consult your doctor or pharmacist.
          </p>
        </div>
      )}
    </div>
  );
}

const DB_SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  india_gazette: { label: "🔴 Government Gazette", cls: "bg-red-50 text-red-700 border-red-200" },
  openFDA:       { label: "🟡 FDA Database",        cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  rxnav:         { label: "🟡 NLM RxNav",           cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  organ_burden:  { label: "🟠 Organ Burden",        cls: "bg-orange-50 text-orange-700 border-orange-200" },
  claude:        { label: "🔵 AI Estimate",          cls: "bg-blue-50 text-blue-700 border-blue-200" },
};

function DashboardSourceBadge({ source }: { source: string }) {
  const badge = DB_SOURCE_BADGE[source] ?? { label: source, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border", badge.cls)}>
      {badge.label}
    </span>
  );
}

// CombinedDietaryPanel is now in @/components/DietaryPanel.tsx
