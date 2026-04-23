import { useState, useRef, useCallback } from "react";
import {
  X,
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  FlaskConical,
  Pill,
  Heart,
  ShieldAlert,
  User,
} from "lucide-react";
import { api, type ReportPreviewData, type ResolvedMedication, type ConditionInsight, type ExtractedLabResult } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SelectionState {
  includePatientInfo: boolean;
  conditions: Set<string>;
  allergies: Set<string>;
  medications: Set<string>;        // rawName as key
  unresolvedMeds: Set<string>;     // rawName as key (saved as-is if included)
  labResults: Set<string>;         // name as key
}

interface Props {
  onClose: () => void;
  onApplied: () => void;  // called after profile is updated — triggers refetch
}

// ── Step definitions ──────────────────────────────────────────────────────────

type Step = "upload" | "analysing" | "preview" | "applying" | "done";

// ── Main component ────────────────────────────────────────────────────────────

export function ReportUploadModal({ onClose, onApplied }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ReportPreviewData | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ─────────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    setError("");

    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setError("Please upload a PDF, JPEG, PNG, or WEBP file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File is too large. Maximum size is 10 MB.");
      return;
    }

    setStep("analysing");
    try {
      const data = await api.patient.parseReport(file);
      setPreview(data);

      const importantLabs = getImportantPreviewLabs(data.labResults);
      // Default: patient-facing items selected
      setSelection({
        includePatientInfo: Object.values(data.patientInfo).some(Boolean),
        conditions: new Set(data.conditions),
        allergies: new Set(data.allergies),
        medications: new Set(data.medications.map((m) => m.rawName)),
        unresolvedMeds: new Set(),  // unresolved meds default OFF — needs review
        labResults: new Set(importantLabs.map((l) => l.name)),
      });
      setStep("preview");
    } catch (e) {
      setError((e as Error).message || "Analysis failed. Please try again.");
      setStep("upload");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  // ── Apply to profile ──────────────────────────────────────────────────────

  const applyToProfile = async () => {
    if (!preview || !selection) return;
    setStep("applying");
    setError("");

    try {
      // 1. Unified save of profile fields, lab results, and report summary
      const reportData: any = {};

      if (selection.includePatientInfo) {
        reportData.patientInfo = {};
        if (preview.patientInfo.name) reportData.patientInfo.name = preview.patientInfo.name;
        if (preview.patientInfo.age) reportData.patientInfo.age = preview.patientInfo.age;
        if (preview.patientInfo.gender) reportData.patientInfo.gender = preview.patientInfo.gender;
        if (preview.patientInfo.bloodGroup) reportData.patientInfo.bloodGroup = preview.patientInfo.bloodGroup;
      }

      if (selection.conditions.size > 0) reportData.conditions = [...selection.conditions];
      if (selection.allergies.size > 0) reportData.allergies = [...selection.allergies];

      if (selection.labResults.size > 0) {
        reportData.labResults = preview.labResults
          .filter((l) => selection.labResults.has(l.name))
          .map((l) => ({
            name: String(l.name ?? ''),
            value: String(l.value ?? ''),
            unit: String(l.unit ?? ''),
            status: l.status,
            referenceRange: l.referenceRange,
            date: preview.reportDate ? new Date(preview.reportDate).toISOString() : new Date().toISOString(),
          }));
      }

      if (preview.reportSummary || preview.reportAnalysis) {
        reportData.reportSummary = {
          date: preview.reportDate ? new Date(preview.reportDate).toISOString() : new Date().toISOString(),
          summary: preview.reportSummary || preview.reportAnalysis?.overview || "Report analysed successfully.",
          keyFindings: preview.reportAnalysis?.keyFindings ?? [],
          foodsToEat: preview.reportAnalysis?.foodsToEat ?? [],
          foodsToAvoid: preview.reportAnalysis?.foodsToAvoid ?? [],
          precautions: preview.reportAnalysis?.precautions ?? [],
          followUpQuestions: preview.reportAnalysis?.followUpQuestions ?? [],
          urgentWarnings: preview.reportAnalysis?.urgentWarnings ?? [],
        };
      }

      if (Object.keys(reportData).length > 0) {
        await api.patient.saveReportData(reportData);
      }

      // Add resolved medications one by one
      const medsToAdd = preview.medications.filter((m) =>
        selection.medications.has(m.rawName)
      );
      for (const med of medsToAdd) {
        await api.patient.addMedication({
          name: med.resolvedName || med.rawName,
          salt: med.resolvedSalt || undefined,
          dosage: med.dosage,
          frequency: med.frequency,
        });
      }

      // Add unresolved meds that user explicitly opted in
      const unresolvedToAdd = preview.unresolvedMedications.filter((m) =>
        selection.unresolvedMeds.has(m.rawName)
      );
      for (const med of unresolvedToAdd) {
        await api.patient.addMedication({
          name: med.rawName,
          dosage: med.dosage,
          frequency: med.frequency,
        });
      }

      // Save rich condition records (with food guidance + precautions)
      const selectedConditions = new Set(selection.conditions);
      const conditionInsightsToSave = (preview.conditionInsights ?? [])
        .filter((ci) => selectedConditions.has(ci.condition))
        .filter((ci) =>
          (ci.precautions?.length ?? 0) > 0 ||
          (ci.foodsToAvoid?.length ?? 0) > 0 ||
          (ci.foodsToEat?.length ?? 0) > 0
        )
        .map((ci) => ({
          name: ci.condition,
          source: 'report' as const,
          diagnosedAt: preview.reportDate ? new Date(preview.reportDate).toISOString() : new Date().toISOString(),
          precautions: ci.precautions ?? [],
          foodsToAvoid: ci.foodsToAvoid ?? [],
          foodsToEat: ci.foodsToEat ?? [],
        }));
      if (conditionInsightsToSave.length > 0) {
        await api.patient.saveConditionRecords(conditionInsightsToSave);
      }

      setStep("done");
      setTimeout(() => {
        onApplied();
        onClose();
      }, 1500);
    } catch (e) {
      setError((e as Error).message || "Failed to update profile. Please try again.");
      setStep("preview");
    }
  };

  // ── Toggle helpers ────────────────────────────────────────────────────────

  const toggleSet = (
    key: keyof Pick<SelectionState, "conditions" | "allergies" | "medications" | "unresolvedMeds" | "labResults">,
    value: string
  ) => {
    setSelection((s) => {
      if (!s) return s;
      const next = new Set(s[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...s, [key]: next };
    });
  };

  // ── Total selected count ──────────────────────────────────────────────────

  const selectedCount = selection
    ? (selection.includePatientInfo ? 1 : 0) +
      selection.conditions.size +
      selection.allergies.size +
      selection.medications.size +
      selection.unresolvedMeds.size +
      selection.labResults.size
    : 0;
  const visibleLabResults = preview ? getImportantPreviewLabs(preview.labResults) : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={step === "analysing" || step === "applying" ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-card border border-card-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">Upload Medical Report</p>
              <p className="text-xs text-muted-foreground">
                {step === "upload" && "PDF, JPEG, PNG — up to 10 MB"}
                {step === "analysing" && "Analysing with Claude AI…"}
                {step === "preview" && preview?.reportDate
                  ? `Report date: ${new Date(preview.reportDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : step === "preview" && "Review extracted information"}
                {step === "applying" && "Updating your profile…"}
                {step === "done" && "Profile updated!"}
              </p>
            </div>
          </div>
          {step !== "analysing" && step !== "applying" && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Upload step ── */}
          {step === "upload" && (
            <div className="p-6 space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all",
                  dragOver
                    ? "border-primary bg-primary/8 scale-[1.01]"
                    : "border-border hover:border-primary/50 hover:bg-accent/50"
                )}
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">Drop your report here</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or <span className="text-primary font-medium">browse files</span>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Prescription, discharge summary, lab report • PDF, JPEG, PNG • Max 10 MB
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={onFileChange}
              />
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="p-3.5 rounded-xl bg-muted border border-border text-xs text-muted-foreground leading-relaxed">
                🔒 <strong>Privacy:</strong> Your report is sent directly to Claude AI for analysis.
                Only the extracted fields (conditions, medications, etc.) are saved to your profile.
                The raw file is never stored on our servers.
              </div>
            </div>
          )}

          {/* ── Analysing step ── */}
          {step === "analysing" && (
            <div className="p-16 flex flex-col items-center gap-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <FileText className="w-7 h-7 text-primary" />
                </div>
                <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-card border-2 border-card flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-foreground">Analysing your report…</p>
                <p className="text-sm text-muted-foreground">
                  Claude is reading medications, conditions, and lab values
                </p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Preview step ── */}
          {step === "preview" && preview && selection && (
            <div className="p-5 space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Uncheck anything you don't want added to your profile.
              </p>

              {/* Report Summary */}
              {preview.reportSummary && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5 mb-2">
                    <FileText className="w-3.5 h-3.5" /> Overall Report Summary
                  </p>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {preview.reportSummary}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-2 text-right">
                    This insight will be saved to your health history.
                  </p>
                </div>
              )}

              {/* Patient-facing report analysis */}
              {preview.reportAnalysis && (
                <div className="bg-background border border-border rounded-xl p-4 space-y-4">
                  <div>
                    <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                      <AlertCircle className="w-3.5 h-3.5 text-primary" /> What This Report Suggests
                    </p>
                    <p className="text-sm text-foreground/90 leading-relaxed">
                      {preview.reportAnalysis.overview}
                    </p>
                  </div>

                  {preview.reportAnalysis.keyFindings.length > 0 && (
                    <div className="space-y-2">
                      {preview.reportAnalysis.keyFindings.map((finding, i) => (
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
                              {finding.evidence && (
                                <p className="text-xs text-muted-foreground mt-0.5">{finding.evidence}</p>
                              )}
                              <p className="text-xs text-foreground/80 leading-relaxed mt-1">{finding.meaning}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(preview.reportAnalysis.foodsToEat.length > 0 || preview.reportAnalysis.foodsToAvoid.length > 0) && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {preview.reportAnalysis.foodsToEat.length > 0 && (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                          <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-2">Eat More</p>
                          <div className="flex flex-wrap gap-1.5">
                            {preview.reportAnalysis.foodsToEat.map((food, i) => (
                              <span key={`${food}-${i}`} className="rounded-full border border-green-200 bg-white px-2.5 py-1 text-xs font-medium text-green-700">
                                {food}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {preview.reportAnalysis.foodsToAvoid.length > 0 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                          <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">Avoid or Limit</p>
                          <div className="flex flex-wrap gap-1.5">
                            {preview.reportAnalysis.foodsToAvoid.map((food, i) => (
                              <span key={`${food}-${i}`} className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700">
                                {food}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {(preview.reportAnalysis.precautions.length > 0 || preview.reportAnalysis.followUpQuestions.length > 0 || preview.reportAnalysis.urgentWarnings.length > 0) && (
                    <div className="grid gap-3">
                      {preview.reportAnalysis.precautions.length > 0 && (
                        <GuidanceList title="Precautions" items={preview.reportAnalysis.precautions} tone="amber" />
                      )}
                      {preview.reportAnalysis.followUpQuestions.length > 0 && (
                        <GuidanceList title="Ask Your Doctor" items={preview.reportAnalysis.followUpQuestions} tone="blue" />
                      )}
                      {preview.reportAnalysis.urgentWarnings.length > 0 && (
                        <GuidanceList title="Seek Urgent Care If" items={preview.reportAnalysis.urgentWarnings} tone="red" />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Patient info */}
              {Object.values(preview.patientInfo).some(Boolean) && (
                <Section
                  icon={<User className="w-3.5 h-3.5" />}
                  title="Patient Info"
                  checked={selection.includePatientInfo}
                  onToggle={() => setSelection((s) => s && ({ ...s, includePatientInfo: !s.includePatientInfo }))}
                >
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground">
                    {preview.patientInfo.name && <span><span className="text-muted-foreground">Name:</span> {preview.patientInfo.name}</span>}
                    {preview.patientInfo.age && <span><span className="text-muted-foreground">Age:</span> {preview.patientInfo.age}</span>}
                    {preview.patientInfo.gender && <span><span className="text-muted-foreground">Gender:</span> {preview.patientInfo.gender}</span>}
                    {preview.patientInfo.bloodGroup && <span><span className="text-muted-foreground">Blood group:</span> {preview.patientInfo.bloodGroup}</span>}
                  </div>
                </Section>
              )}

              {/* Conditions */}
              {preview.conditions.length > 0 && (
                <Section icon={<Heart className="w-3.5 h-3.5" />} title="Medical Conditions">
                  <div className="flex flex-wrap gap-2">
                    {preview.conditions.map((c) => (
                      <Tag
                        key={c}
                        label={c}
                        checked={selection.conditions.has(c)}
                        onToggle={() => toggleSet("conditions", c)}
                        color="blue"
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Allergies */}
              {preview.allergies.length > 0 && (
                <Section icon={<ShieldAlert className="w-3.5 h-3.5" />} title="Allergies">
                  <div className="flex flex-wrap gap-2">
                    {preview.allergies.map((a) => (
                      <Tag
                        key={a}
                        label={a}
                        checked={selection.allergies.has(a)}
                        onToggle={() => toggleSet("allergies", a)}
                        color="red"
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Resolved medications */}
              {preview.medications.length > 0 && (
                <Section icon={<Pill className="w-3.5 h-3.5" />} title="Medications">
                  <div className="space-y-2">
                    {preview.medications.map((med: ResolvedMedication) => (
                      <MedRow
                        key={med.rawName}
                        med={med}
                        checked={selection.medications.has(med.rawName)}
                        onToggle={() => toggleSet("medications", med.rawName)}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Unresolved medications */}
              {preview.unresolvedMedications.length > 0 && (
                <Section
                  icon={<Pill className="w-3.5 h-3.5" />}
                  title="Unmatched Medications"
                  badge="Not in DB"
                >
                  <p className="text-xs text-muted-foreground mb-2">
                    These were extracted but couldn't be matched to our medicine database. Opt in to add them as-is.
                  </p>
                  <div className="space-y-1.5">
                    {preview.unresolvedMedications.map((med) => (
                      <label key={med.rawName} className="flex items-start gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selection.unresolvedMeds.has(med.rawName)}
                          onChange={() => toggleSet("unresolvedMeds", med.rawName)}
                          className="mt-0.5 accent-primary"
                        />
                        <div>
                          <p className="text-sm font-medium text-foreground">{med.rawName}</p>
                          {(med.dosage || med.frequency) && (
                            <p className="text-xs text-muted-foreground">
                              {[med.dosage, med.frequency].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </Section>
              )}

              {/* Lab results */}
              {visibleLabResults.length > 0 && (
                <Section icon={<FlaskConical className="w-3.5 h-3.5" />} title="Lab Results">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border">
                          <th className="text-left pb-1.5 font-medium w-6"></th>
                          <th className="text-left pb-1.5 font-medium">Test</th>
                          <th className="text-right pb-1.5 font-medium">Value</th>
                          <th className="text-right pb-1.5 font-medium">Unit</th>
                          <th className="text-right pb-1.5 font-medium">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLabResults.map((lab) => {
                          const isHigh = lab.status?.toLowerCase() === 'high';
                          const isLow = lab.status?.toLowerCase() === 'low';
                          const isAbnormal = lab.status?.toLowerCase() === 'abnormal';
                          const hasAlert = isHigh || isLow || isAbnormal;

                          return (
                            <tr key={lab.name} className="border-b border-border/50 last:border-0">
                              <td className="py-2 pr-2">
                                <input
                                  type="checkbox"
                                  checked={selection.labResults.has(lab.name)}
                                  onChange={() => toggleSet("labResults", lab.name)}
                                  className="accent-primary"
                                />
                              </td>
                              <td className="py-2 text-foreground font-medium pr-2">
                                <div className="flex items-center gap-1.5">
                                  {lab.name}
                                  {hasAlert && (
                                    <span className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                                      isHigh && "bg-red-100 text-red-700",
                                      isLow && "bg-blue-100 text-blue-700",
                                      isAbnormal && "bg-amber-100 text-amber-700"
                                    )}>
                                      {lab.status}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 text-right font-mono font-semibold text-foreground">{lab.value}</td>
                              <td className="py-2 text-right text-muted-foreground text-xs">{lab.unit}</td>
                              <td className="py-2 text-right text-muted-foreground/70 text-xs pl-3 font-mono">
                                {lab.referenceRange || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {/* Condition Insights — per-condition food & precaution guidance */}
              {(preview.conditionInsights ?? []).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                    🩺 Condition-Specific Guidance
                  </p>
                  {(preview.conditionInsights ?? []).map((ci: ConditionInsight) => (
                    <div key={ci.condition} className="space-y-2">
                      <p className="text-xs font-semibold text-amber-900">{ci.condition}</p>
                      {ci.precautions.length > 0 && (
                        <ul className="space-y-0.5">
                          {ci.precautions.map((p, i) => (
                            <li key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                              <span className="shrink-0 mt-0.5">•</span>{p}
                            </li>
                          ))}
                        </ul>
                      )}
                      {ci.foodsToAvoid.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {ci.foodsToAvoid.map((f, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 border border-red-200 rounded-full">🚫 {f}</span>
                          ))}
                        </div>
                      )}
                      {ci.foodsToEat.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {ci.foodsToEat.map((f, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 border border-green-200 rounded-full">✓ {f}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-amber-700">This guidance will be saved to your Health History and used to personalise your dietary advice.</p>
                </div>
              )}

              {/* Empty state */}
              {preview.conditions.length === 0 &&
                preview.medications.length === 0 &&
                preview.labResults.length === 0 &&
                !Object.values(preview.patientInfo).some(Boolean) && (
                <div className="p-6 text-center text-muted-foreground text-sm space-y-2">
                  <p className="text-2xl">🤔</p>
                  <p>No medical information could be extracted.</p>
                  <p className="text-xs">Make sure the file is a prescription, lab report, or discharge summary.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Applying step ── */}
          {step === "applying" && (
            <div className="p-16 flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="font-semibold text-foreground">Updating your profile…</p>
            </div>
          )}

          {/* ── Done step ── */}
          {step === "done" && (
            <div className="p-16 flex flex-col items-center gap-4">
              <CheckCircle className="w-12 h-12 text-primary" />
              <div className="text-center">
                <p className="font-semibold text-foreground">Profile updated!</p>
                <p className="text-sm text-muted-foreground">Your medical information has been added.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "preview" && preview && selection && (
          <div className="px-5 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
            </p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent transition-all"
              >
                Cancel
              </button>
              <button
                onClick={applyToProfile}
                disabled={selectedCount === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all"
              >
                Apply to Profile <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function getImportantPreviewLabs(labs: ExtractedLabResult[]): ExtractedLabResult[] {
  const important = labs.filter((lab) => {
    const status = lab.status?.toLowerCase();
    return status === "high" || status === "low" || status === "abnormal";
  });

  return important.length > 0 ? important : labs.slice(0, 8);
}

function Section({
  icon,
  title,
  badge,
  checked,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  checked?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/50 rounded-xl p-4 space-y-3 border border-border/60">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{title}</span>
        {badge && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium border border-amber-200">
            {badge}
          </span>
        )}
        {onToggle !== undefined && (
          <label className="ml-auto flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={checked ?? false}
              onChange={onToggle}
              className="accent-primary"
            />
            Include
          </label>
        )}
      </div>
      {children}
    </div>
  );
}

function Tag({
  label,
  checked,
  onToggle,
  color,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  color: "blue" | "red";
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
        checked
          ? color === "blue"
            ? "bg-blue-500/15 text-blue-700 border-blue-400/40"
            : "bg-destructive/15 text-destructive border-destructive/40"
          : "bg-background text-muted-foreground border-border opacity-50 line-through"
      )}
    >
      {checked && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {label}
    </button>
  );
}

function GuidanceList({
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

function MedRow({
  med,
  checked,
  onToggle,
}: {
  med: ResolvedMedication;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
        checked ? "bg-primary/5 border-primary/25" : "bg-background border-border opacity-60"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 accent-primary"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{med.resolvedName || med.rawName}</p>
        {med.resolvedSalt && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{med.resolvedSalt}</p>
        )}
        {med.rawName !== med.resolvedName && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Extracted as: {med.rawName}
          </p>
        )}
        {(med.dosage || med.frequency) && (
          <p className="text-xs text-primary/80 mt-1">
            {[med.dosage, med.frequency].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </label>
  );
}
