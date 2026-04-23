import { useState, useEffect } from "react";
import { api, type PatientProfile, type ConditionRecord, type ReportSummary, type LabResult } from "@/lib/api";
import {
  User,
  Pencil,
  Check,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Pill,
  Trash2,
  Plus,
  Upload,
  FileText,
  FlaskConical,
  Calendar,
  HeartPulse,
  ShieldCheck,
  UtensilsCrossed,
  Apple,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportUploadModal } from "@/components/ReportUploadModal";

const COMMON_CONDITIONS = [
  "Diabetes", "Hypertension", "Liver Disease", "Kidney Disease",
  "Heart Disease", "Asthma", "Thyroid Disorder", "Epilepsy", "Pregnancy",
];

export default function ProfilePage() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [resolvingCondition, setResolvingCondition] = useState<string | null>(null);
  const [expandedCondition, setExpandedCondition] = useState<string | null>(null);

  const loadProfile = () => {
    setLoading(true);
    api.patient.getProfile()
      .then((p) => {
        setProfile(p);
        setForm({
          name: p.name,
          age: p.age?.toString() ?? "",
          conditions: p.conditions ?? [],
          allergies: p.allergies ?? [],
          allergyInput: "",
        });
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  const [form, setForm] = useState({
    name: "",
    age: "",
    conditions: [] as string[],
    allergies: [] as string[],
    allergyInput: "",
  });

  useEffect(() => {
    loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await api.patient.updateProfile({
        name: form.name,
        age: form.age ? Number(form.age) : undefined,
        conditions: form.conditions,
        allergies: form.allergies,
      });
      setProfile(updated);
      setEditing(false);
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resolveCondition = async (conditionName: string) => {
    setResolvingCondition(conditionName);
    try {
      const updated = await api.patient.resolveCondition(conditionName);
      setProfile(updated);
      setSuccess(`"${conditionName}" marked as recovered. Related food warnings removed.`);
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResolvingCondition(null);
    }
  };

  const toggleCondition = (c: string) =>
    setForm((f) => ({
      ...f,
      conditions: f.conditions.includes(c)
        ? f.conditions.filter((x) => x !== c)
        : [...f.conditions, c],
    }));

  const addAllergy = () => {
    const val = form.allergyInput.trim();
    if (val && !form.allergies.includes(val)) {
      setForm((f) => ({ ...f, allergies: [...f.allergies, val], allergyInput: "" }));
    }
  };

  const removeMedication = async (medId: string) => {
    try {
      const updated = await api.patient.removeMedication(medId);
      setProfile(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const visibleConditionRecords = (profile?.conditionRecords ?? []).filter(hasConditionGuidance);
  const activeVisibleConditions = visibleConditionRecords.filter((r) => !r.resolvedAt);
  const recoveredVisibleConditions = visibleConditionRecords.filter((r) => r.resolvedAt);
  const importantLabResults = getImportantLabResults(profile?.labResults ?? []);
  const hiddenNormalLabCount = Math.max((profile?.labResults?.length ?? 0) - importantLabResults.length, 0);

  return (<>
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your health information</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent transition-all"
          >
            <Upload className="w-4 h-4" /> Upload Report
          </button>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent transition-all"
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { setEditing(false); setError(""); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent transition-all"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Avatar + basic info */}
      <div className="bg-card border border-card-border rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">
              {(profile?.name ?? "U").charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 space-y-3">
            {editing ? (
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            ) : (
              <p className="font-bold text-lg text-foreground">{profile?.name}</p>
            )}
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
            {editing ? (
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground shrink-0">Age:</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.age}
                  onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                  placeholder="e.g. 35"
                  className="w-24 px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
            ) : (
              profile?.age && <p className="text-sm text-muted-foreground">Age: {profile.age}</p>
            )}
          </div>
        </div>
      </div>

      {/* Conditions */}
      <div className="bg-card border border-card-border rounded-2xl p-5 shadow-xs space-y-3">
        <h2 className="font-semibold text-foreground">Medical Conditions</h2>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            {COMMON_CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCondition(c)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                  form.conditions.includes(c)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:border-primary/50"
                )}
              >
                {form.conditions.includes(c) && <Check className="inline w-3 h-3 mr-1 -mt-0.5" />}
                {c}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(profile?.conditions?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded</p>
            ) : (
              profile?.conditions.map((c) => (
                <span key={c} className="px-3 py-1 bg-chart-2/10 text-chart-2 border border-chart-2/20 rounded-full text-xs font-medium">
                  {c}
                </span>
              ))
            )}
          </div>
        )}
      </div>

      {/* Allergies */}
      <div className="bg-card border border-card-border rounded-2xl p-5 shadow-xs space-y-3">
        <h2 className="font-semibold text-foreground">Drug Allergies</h2>
        {editing ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={form.allergyInput}
                onChange={(e) => setForm((f) => ({ ...f, allergyInput: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAllergy())}
                placeholder="Add allergyâ€¦"
                className="flex-1 px-3.5 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <button onClick={addAllergy} className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-all">
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.allergies.map((a) => (
                <span key={a} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20">
                  {a}
                  <button type="button" onClick={() => setForm((f) => ({ ...f, allergies: f.allergies.filter((x) => x !== a) }))}>
                    <X className="w-3 h-3 hover:opacity-70" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(profile?.allergies?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded</p>
            ) : (
              profile?.allergies.map((a) => (
                <span key={a} className="px-3 py-1 bg-destructive/10 text-destructive border border-destructive/20 rounded-full text-xs font-medium">
                  {a}
                </span>
              ))
            )}
          </div>
        )}
      </div>

      {/* Current medications */}
      <div className="bg-card border border-card-border rounded-2xl p-5 shadow-xs space-y-3">
        <h2 className="font-semibold text-foreground">Current Medications</h2>
        {(profile?.medications?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No medicines added yet</p>
        ) : (
          <div className="space-y-2">
            {profile?.medications.map((med) => (
              <div key={med._id} className="flex items-center gap-3 px-4 py-3 bg-muted rounded-xl">
                <Pill className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{med.name}</p>
                  {med.dosage && <p className="text-xs text-muted-foreground">{med.dosage}</p>}
                </div>
                <button
                  onClick={() => removeMedication(med._id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Condition History */}
      {visibleConditionRecords.length > 0 && (
        <div className="bg-card border border-card-border rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Health History</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {activeVisibleConditions.length} active ·{" "}
              {recoveredVisibleConditions.length} recovered
            </span>
          </div>

          <div className="space-y-3">
            {visibleConditionRecords.map((rec: ConditionRecord) => {
              const isResolved = !!rec.resolvedAt;
              const isExpanded = expandedCondition === rec._id;
              const isResolving = resolvingCondition === rec.name;
              return (
                <div
                  key={rec._id}
                  className={cn(
                    "rounded-xl border transition-all",
                    isResolved
                      ? "border-green-200 bg-green-50/50"
                      : "border-border bg-muted/30"
                  )}
                >
                  {/* Header row */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedCondition(isExpanded ? null : rec._id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-sm font-semibold truncate", isResolved ? "text-green-800" : "text-foreground")}>
                          {rec.name}
                        </span>
                        {/* Source badge */}
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                          rec.source === 'report'
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-muted text-muted-foreground border-border"
                        )}>
                          {rec.source === 'report' ? 'ðŸ“‹ From Report' : 'âœï¸ Manual'}
                        </span>
                        {/* Recovery badge */}
                        {isResolved && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 shrink-0">
                            âœ“ Recovered
                          </span>
                        )}
                      </div>
                      {rec.diagnosedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {isResolved
                            ? `Recovered ${new Date(rec.resolvedAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : `Diagnosed ${new Date(rec.diagnosedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          }
                        </p>
                      )}
                    </div>
                    <span className={cn("text-xs text-muted-foreground transition-transform", isExpanded && "rotate-180")}>â–¾</span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">

                      {/* Precautions */}
                      {rec.precautions.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                            <ShieldCheck className="w-3.5 h-3.5" /> Precautions
                          </p>
                          <ul className="space-y-1">
                            {rec.precautions.map((p, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-foreground/80 leading-relaxed">
                                <span className="text-amber-500 mt-0.5 shrink-0">â€¢</span>{p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Foods to avoid */}
                      {rec.foodsToAvoid.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-destructive uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                            <UtensilsCrossed className="w-3.5 h-3.5" /> Avoid These Foods
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {rec.foodsToAvoid.map((f, i) => (
                              <span key={i} className="text-xs px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full font-medium">
                                ðŸš« {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Foods to eat */}
                      {rec.foodsToEat.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                            <Apple className="w-3.5 h-3.5" /> Beneficial Foods
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {rec.foodsToEat.map((f, i) => (
                              <span key={i} className="text-xs px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full font-medium">
                                âœ“ {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mark Recovered button */}
                      {!isResolved && (
                        <button
                          onClick={() => resolveCondition(rec.name)}
                          disabled={isResolving}
                          className="flex items-center gap-2 mt-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-all"
                        >
                          {isResolving
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <CheckCircle className="w-3.5 h-3.5" />
                          }
                          {isResolving ? "Updatingâ€¦" : "Mark as Recovered"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Report Insights (Summaries) */}
      {(profile?.reportSummaries?.length ?? 0) > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Report Insights</h2>
          </div>
          <div className="space-y-3">
            {profile!.reportSummaries!.slice().reverse().map((summary) => (
              <ReportInsightCard key={summary._id} summary={summary} />
            ))}
          </div>
        </div>
      )}

      {/* Lab Results History */}
      {importantLabResults.length > 0 && (
        <div className="bg-card border border-card-border rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Lab Results</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {importantLabResults.length} important · {hiddenNormalLabCount} normal hidden
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Test</th>
                  <th className="text-right py-2 pr-4 font-medium">Value</th>
                  <th className="text-right py-2 pr-4 font-medium">Unit</th>
                  <th className="text-right py-2 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody>
                {importantLabResults.map((lab) => {
                  const isHigh = lab.status?.toLowerCase() === 'high';
                  const isLow = lab.status?.toLowerCase() === 'low';
                  const isAbnormal = lab.status?.toLowerCase() === 'abnormal';
                  const hasAlert = isHigh || isLow || isAbnormal;

                  return (
                    <tr key={lab._id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-2 pr-4 text-foreground font-medium">
                        <div className="flex items-center gap-1.5">
                          {lab.name}
                          {hasAlert && (
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0",
                              isHigh && "bg-red-100 text-red-700",
                              isLow && "bg-blue-100 text-blue-700",
                              isAbnormal && "bg-amber-100 text-amber-700"
                            )}>
                              {lab.status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono font-bold text-foreground">{lab.value}</td>
                      <td className="py-2 pr-4 text-right text-muted-foreground text-xs">{lab.unit || 'â€”'}</td>
                      <td className="py-2 text-right text-muted-foreground/70 text-xs font-mono">{lab.referenceRange || 'â€”'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {profile!.labResults!.some(l => l.date) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
              <Calendar className="w-3 h-3" />
              Last updated: {new Date(profile!.labResults![0].date!).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>
      )}
    </div>

    {showUpload && (
      <ReportUploadModal
        onClose={() => setShowUpload(false)}
        onApplied={() => {
          setShowUpload(false);
          setSuccess("Profile updated from your report!");
          setTimeout(() => setSuccess(""), 4000);
          loadProfile();
        }}
      />
    )}
  </>);
}

function hasConditionGuidance(rec: ConditionRecord): boolean {
  return (
    (rec.precautions?.length ?? 0) > 0 ||
    (rec.foodsToAvoid?.length ?? 0) > 0 ||
    (rec.foodsToEat?.length ?? 0) > 0
  );
}

function isImportantLab(lab: LabResult): boolean {
  const status = lab.status?.toLowerCase();
  return status === "high" || status === "low" || status === "abnormal";
}

function labDisplayKey(lab: LabResult): string {
  return lab.name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(total|serum|plasma|blood)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getImportantLabResults(labs: LabResult[]): LabResult[] {
  const important = labs.filter(isImportantLab);
  const byKey = new Map<string, LabResult>();

  for (const lab of important) {
    const key = labDisplayKey(lab) || lab.name.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || (lab.referenceRange && !existing.referenceRange)) {
      byKey.set(key, lab);
    }
  }

  return [...byKey.values()];
}

function ReportInsightCard({ summary }: { summary: ReportSummary }) {
  const findings = compactReportFindings(summary.keyFindings ?? []);

  return (
    <div className="bg-background rounded-xl p-4 border border-primary/10 space-y-4">
      <div>
        <p className="text-sm text-foreground/90 leading-relaxed">{summary.summary}</p>
        <div className="mt-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          {new Date(summary.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {findings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-foreground/60 uppercase tracking-wide">Key Takeaways</p>
          {findings.map((finding, i) => (
            <div key={`${finding.title}-${i}`} className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 h-2 w-2 rounded-full shrink-0",
                    finding.severity === "urgent" && "bg-red-600",
                    finding.severity === "needs_attention" && "bg-orange-500",
                    finding.severity === "watch" && "bg-amber-500",
                    finding.severity === "normal" && "bg-green-500"
                  )}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{finding.title}</p>
                  <p className="text-xs text-foreground/80 leading-relaxed mt-1">{finding.meaning}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {((summary.foodsToEat?.length ?? 0) > 0 || (summary.foodsToAvoid?.length ?? 0) > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(summary.foodsToEat?.length ?? 0) > 0 && (
            <FoodChipGroup title="Eat More" foods={summary.foodsToEat!} tone="green" />
          )}
          {(summary.foodsToAvoid?.length ?? 0) > 0 && (
            <FoodChipGroup title="Avoid or Limit" foods={summary.foodsToAvoid!} tone="red" />
          )}
        </div>
      )}

      {(summary.precautions?.length ?? 0) > 0 && (
        <ProfileGuidanceList title="Precautions" items={summary.precautions!} tone="amber" />
      )}
      {(summary.followUpQuestions?.length ?? 0) > 0 && (
        <ProfileGuidanceList title="Ask Your Doctor" items={summary.followUpQuestions!} tone="blue" />
      )}
      {(summary.urgentWarnings?.length ?? 0) > 0 && (
        <ProfileGuidanceList title="Seek Urgent Care If" items={summary.urgentWarnings!} tone="red" />
      )}
    </div>
  );
}

function compactReportFindings(findings: NonNullable<ReportSummary["keyFindings"]>): NonNullable<ReportSummary["keyFindings"]> {
  const seen = new Set<string>();
  const compacted: NonNullable<ReportSummary["keyFindings"]> = [];

  for (const finding of findings) {
    if (finding.severity === "normal") continue;
    const key = findingGroupKey(finding);
    if (seen.has(key)) continue;
    seen.add(key);
    compacted.push(finding);
    if (compacted.length >= 5) break;
  }

  return compacted;
}

function findingGroupKey(finding: NonNullable<ReportSummary["keyFindings"]>[number]): string {
  const text = `${finding.title} ${finding.evidence ?? ""} ${finding.meaning}`.toLowerCase();
  if (/ha?emoglobin|iron|tibc|transferrin|rdw|mcv|mch|pcv|anemia|anaemia/.test(text)) return "iron-deficiency";
  if (/vitamin d/.test(text)) return "vitamin-d";
  if (/triglyceride|hdl|vldl|cholesterol|lipid/.test(text)) return "lipids";
  if (/esr|globulin|a:g|inflammation/.test(text)) return "inflammation";
  return finding.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function FoodChipGroup({
  title,
  foods,
  tone,
}: {
  title: string;
  foods: string[];
  tone: "green" | "red";
}) {
  const styles = {
    green: {
      wrap: "border-green-200 bg-green-50",
      title: "text-green-700",
      chip: "border-green-200 text-green-700",
    },
    red: {
      wrap: "border-red-200 bg-red-50",
      title: "text-red-700",
      chip: "border-red-200 text-red-700",
    },
  }[tone];

  return (
    <div className={cn("rounded-lg border p-3", styles.wrap)}>
      <p className={cn("text-xs font-bold uppercase tracking-wide mb-2", styles.title)}>{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {foods.map((food, i) => (
          <span key={`${food}-${i}`} className={cn("rounded-full border bg-white px-2.5 py-1 text-xs font-medium", styles.chip)}>
            {food}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProfileGuidanceList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "amber" | "blue" | "red";
}) {
  const styles = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    red: "border-red-200 bg-red-50 text-red-800",
  }[tone];

  return (
    <div className={cn("rounded-lg border p-3", styles)}>
      <p className="text-xs font-bold uppercase tracking-wide mb-2">{title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={`${item}-${i}`} className="flex items-start gap-2 text-xs leading-relaxed">
            <span className="mt-1 h-1 w-1 rounded-full bg-current shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
