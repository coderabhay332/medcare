import { useState } from "react";
import {
  UtensilsCrossed, X, CheckCircle, Clock, Coffee, Utensils,
  Moon, Lightbulb, Pill, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFoodImage } from "@/hooks/useFoodImage";
import type {
  CombinedDietaryResult, CombinedAvoidItem, MealScheduleItem, MedicineTip,
} from "@/lib/api";

// ── Food image card (Pexels + emoji fallback) ────────────────────────────────
function FoodCard({
  name,
  severity,
  timingContext,
}: {
  name: string;
  severity?: "high" | "moderate" | "low";
  timingContext?: string;
}) {
  const { url, loading, emoji } = useFoodImage(name);

  const severityStyle = {
    high:     "border-red-300 bg-red-50",
    moderate: "border-orange-300 bg-orange-50",
    low:      "border-yellow-200 bg-yellow-50",
  }[severity ?? "moderate"];

  const badge = {
    high:     "🚫",
    moderate: "⚠️",
    low:      "💡",
  }[severity ?? "moderate"];

  return (
    <div className={cn("flex flex-col rounded-2xl border overflow-hidden shadow-xs transition-all hover:shadow-sm", severityStyle)}>
      {/* image */}
      <div className="relative w-full aspect-square bg-muted/40">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-3xl animate-pulse">
            {emoji}
          </div>
        )}
        {url ? (
          <img
            src={url}
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : !loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-3xl">{emoji}</div>
        ) : null}
        {/* severity badge */}
        <span className="absolute top-1.5 right-1.5 text-base leading-none">{badge}</span>
      </div>
      {/* label */}
      <div className="px-2 py-1.5 text-center">
        <p className="text-xs font-semibold text-foreground truncate">{name}</p>
        {timingContext && (
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{timingContext}</p>
        )}
      </div>
    </div>
  );
}

// ── Safe food card (green) ────────────────────────────────────────────────────
function SafeFoodCard({ name }: { name: string }) {
  const { url, loading, emoji } = useFoodImage(name);
  return (
    <div className="flex flex-col rounded-2xl border border-green-200 bg-green-50 overflow-hidden shadow-xs hover:shadow-sm transition-all">
      <div className="relative w-full aspect-square bg-green-100/60">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-3xl animate-pulse">{emoji}</div>
        )}
        {url ? (
          <img src={url} alt={name} className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : !loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-3xl">{emoji}</div>
        ) : null}
        <span className="absolute top-1.5 right-1.5 text-sm leading-none">✅</span>
      </div>
      <div className="px-2 py-1.5 text-center">
        <p className="text-xs font-semibold text-green-800 truncate">{name}</p>
      </div>
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────
type Tab = "avoid" | "safe" | "schedule" | "tips";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "avoid",    label: "Avoid",    emoji: "🚫" },
  { id: "safe",     label: "Safe",     emoji: "✅" },
  { id: "schedule", label: "Schedule", emoji: "🕐" },
  { id: "tips",     label: "Tips",     emoji: "💡" },
];

const CAT_ICON: Record<string, React.ElementType> = {
  Foods:                  UtensilsCrossed,
  Drinks:                 Coffee,
  Supplements:            Lightbulb,
  "Herbs & Home Remedies": Lightbulb,
};

const TIMING_CONFIG = {
  before:        { label: "Before Meals",  icon: Coffee,   bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700",  badge: "bg-amber-100" },
  after:         { label: "After Meals",   icon: Utensils, bg: "bg-green-50", border: "border-green-200", text: "text-green-700",  badge: "bg-green-100" },
  empty_stomach: { label: "Empty Stomach", icon: Moon,     bg: "bg-blue-50",  border: "border-blue-200",  text: "text-blue-700",   badge: "bg-blue-100" },
  any:           { label: "Anytime",       icon: Clock,    bg: "bg-muted",    border: "border-border",    text: "text-foreground", badge: "bg-accent" },
};

// ── Main exported component ───────────────────────────────────────────────────
export function CombinedDietaryPanel({ advice }: { advice: CombinedDietaryResult }) {
  const [activeTab, setActiveTab] = useState<Tab>("avoid");

  const avoidCount = advice.avoid.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="p-0">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-all border-b-2",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <span className="text-base leading-none">{tab.emoji}</span>
            <span>{tab.label}</span>
            {tab.id === "avoid" && avoidCount > 0 && (
              <span className="text-[9px] font-bold bg-destructive/10 text-destructive px-1.5 rounded-full">
                {avoidCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="animate-in fade-in duration-200">

        {/* ── AVOID ── */}
        {activeTab === "avoid" && (
          <div className="p-4 space-y-5">
            {advice.avoid.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No specific foods to avoid found.</p>
            )}
            {advice.avoid.map((cat: CombinedAvoidItem, i: number) => {
              const Icon = CAT_ICON[cat.category] ?? UtensilsCrossed;
              return (
                <div key={i}>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Icon className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-xs font-bold text-destructive uppercase tracking-wide">{cat.category}</span>
                  </div>
                  {/* food image grid */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {cat.items.map((item, j: number) => {
                      const nm = typeof item === "string" ? item : item.name;
                      const sv = typeof item === "string" ? "moderate" : item.severity;
                      const tc = typeof item === "string" ? "" : item.timingContext;
                      return <FoodCard key={j} name={nm} severity={sv} timingContext={tc} />;
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{cat.reason}</p>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
              AI-generated guidance for Indian patients. Always confirm with your doctor or pharmacist.
            </p>
          </div>
        )}

        {/* ── SAFE FOODS ── */}
        {activeTab === "safe" && (
          <div className="p-4">
            {advice.safeToEat.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No safe food data yet.</p>
            ) : (
              <>
                <p className="text-xs text-green-700 font-semibold flex items-center gap-1.5 mb-3">
                  <CheckCircle className="w-3.5 h-3.5" /> Safe to eat with all your medicines
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {advice.safeToEat.map((food: string, i: number) => (
                    <SafeFoodCard key={i} name={food} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {activeTab === "schedule" && (
          <div className="p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-3">
              <Clock className="w-3.5 h-3.5" /> When to Take Your Medicines
            </p>
            {advice.mealSchedule.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No schedule data yet.</p>
            )}
            {advice.mealSchedule.map((item: MealScheduleItem, i: number) => {
              const cfg = TIMING_CONFIG[item.timing] ?? TIMING_CONFIG.any;
              const Icon = cfg.icon;
              return (
                <div key={i} className={cn("flex items-start gap-3 p-3.5 rounded-xl border", cfg.bg, cfg.border)}>
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", cfg.badge)}>
                    <Icon className={cn("w-4 h-4", cfg.text)} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">{item.medicine}</span>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", cfg.badge, cfg.text)}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.note}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TIPS ── */}
        {activeTab === "tips" && (
          <div className="p-4 space-y-4">
            {advice.medicineTips && advice.medicineTips.length > 0 && (
              <div>
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
                  <Pill className="w-3.5 h-3.5" /> Medicine Tips
                </p>
                <div className="space-y-2">
                  {advice.medicineTips.map((mt: MedicineTip, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-100">
                      <Pill className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">{mt.medicine}</span>
                        <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">{mt.tip}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {advice.generalTips.length > 0 && (
              <div>
                <p className="text-xs font-bold text-foreground/60 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Lightbulb className="w-3.5 h-3.5" /> General Tips
                </p>
                <ul className="space-y-2">
                  {advice.generalTips.map((tip: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground/70 leading-relaxed p-2.5 rounded-lg bg-muted/50">
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {advice.medicineTips.length === 0 && advice.generalTips.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No tips available yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
