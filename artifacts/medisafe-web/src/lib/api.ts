const BASE = "/api";

export interface AuthTokens {
  token: string;
  patient: {
    id: string;
    name: string;
    email: string;
  };
}

export interface MedicineSearchResult {
  id: string;
  name: string;
  salt: string;
  manufacturer?: string;
  type?: string;
  price?: number;
  pack?: string;
}

export interface Medication {
  _id: string;
  name: string;
  salt?: string;
  dosage?: string;
  frequency?: string;
  addedAt: string;
}


export interface LabResult {
  _id: string;
  name: string;
  value: string;
  unit: string;
  status?: string;
  referenceRange?: string;
  date?: string;
}

export interface ReportSummary {
  _id: string;
  date: string;
  summary: string;
  keyFindings?: ReportFinding[];
  foodsToEat?: string[];
  foodsToAvoid?: string[];
  precautions?: string[];
  followUpQuestions?: string[];
  urgentWarnings?: string[];
}

export interface ConditionRecord {
  _id: string;
  name: string;
  diagnosedAt?: string;
  resolvedAt?: string;
  source: 'manual' | 'report';
  precautions: string[];
  foodsToAvoid: string[];
  foodsToEat: string[];
}

export interface PatientProfile {
  _id: string;
  name: string;
  email: string;
  age?: number;
  weight?: number;
  gender?: string;
  bloodGroup?: string;
  conditions: string[];
  allergies: string[];
  medications: Medication[];
  currentMedications?: Medication[];
  labResults?: LabResult[];
  reportSummaries?: ReportSummary[];
  conditionRecords?: ConditionRecord[];   // rich condition history from reports
  createdAt: string;
}


export interface CheckResultItem {
  pair: string[];
  medicine?: string;
  conflictsWith?: string | null;
  severity: "none" | "mild" | "moderate" | "severe";
  reason: string;
  problem: string;
  alternatives: string[];
  source: string;
}

export interface CheckResponse {
  overallSafe: boolean;
  bannedFound: { medicines: string[]; reason: string }[];
  results: CheckResultItem[];
  organWarnings: string[];
  summary: string;
}

export interface ScanResult {
  medicines: string[];      // extracted medicine names shown to the user
  matched: { name: string; [k: string]: unknown }[];
  unmatched: string[];
  rawText?: string;
}

export interface DietaryAdviceItem {
  category: string;
  avoid: string[];
  reason: string;
}

export interface DietaryAdviceResult {
  medicine: string;
  items: DietaryAdviceItem[];
  cached: boolean;
}

export interface CombinedAvoidItem {
  category: string;
  items: { name: string; severity: 'high' | 'moderate' | 'low'; timingContext: string }[];
  reason: string;
}

export interface MealScheduleItem {
  medicine: string;
  timing: 'before' | 'after' | 'empty_stomach' | 'any';
  note: string;
}

export interface MedicineTip {
  medicine: string;
  tip: string;
}

export interface CombinedDietaryResult {
  medicines: string[];
  avoid: CombinedAvoidItem[];
  safeToEat: string[];
  mealSchedule: MealScheduleItem[];
  medicineTips: MedicineTip[];
  generalTips: string[];
  cached: boolean;
}

// ── Report upload types ──────────────────────────────────────────────────────

export interface ExtractedLabResult {
  name: string;
  value: string;
  unit: string;
  status?: string;
  referenceRange?: string;
}

export interface ResolvedMedication {
  rawName: string;         // e.g. "Tab. Augmentin 625"
  resolvedName: string;    // e.g. "Augmentin 625 Duo Tablet"
  resolvedSalt: string;    // e.g. "Amoxycillin (500mg) + Clavulanic Acid (125mg)"
  dosage?: string;
  frequency?: string;
  matchConfidence: 'high' | 'low';
}

export interface UnresolvedMedication {
  rawName: string;
  dosage?: string;
  frequency?: string;
}

export interface ReportPatientInfo {
  name?: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
}

export interface ConditionInsight {
  condition: string;
  precautions: string[];
  foodsToAvoid: string[];
  foodsToEat: string[];
}

export interface ReportFinding {
  title: string;
  evidence?: string;
  meaning: string;
  severity: 'normal' | 'watch' | 'needs_attention' | 'urgent';
}

export interface ReportAnalysis {
  overview: string;
  keyFindings: ReportFinding[];
  foodsToEat: string[];
  foodsToAvoid: string[];
  precautions: string[];
  followUpQuestions: string[];
  urgentWarnings: string[];
}

export interface ReportPreviewData {
  reportDate?: string;
  reportSummary?: string;
  reportAnalysis?: ReportAnalysis;
  patientInfo: ReportPatientInfo;
  conditions: string[];
  conditionInsights: ConditionInsight[];
  allergies: string[];
  medications: ResolvedMedication[];
  unresolvedMedications: UnresolvedMedication[];
  labResults: ExtractedLabResult[];
}

function getToken(): string | null {
  return localStorage.getItem("medisafe_token");
}

function authHeaders(): HeadersInit {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const envelope = await res.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!res.ok) {
    throw new Error(envelope.message ?? envelope.error ?? `HTTP ${res.status}`);
  }
  // Unwrap the { success, data } envelope the API uses
  return (envelope.data !== undefined ? envelope.data : envelope) as T;
}

export const api = {
  auth: {
    register: (body: { name: string; email: string; password: string; age?: number; conditions?: string[]; allergies?: string[] }) =>
      request<AuthTokens>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
    login: (body: { email: string; password: string }) =>
      request<AuthTokens>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  },

  patient: {
    getProfile: () =>
      request<PatientProfile>("/patient/profile").then((p) => ({
        ...p,
        // Backend stores as currentMedications; normalise to medications
        medications: p.currentMedications ?? p.medications ?? [],
      })),
    updateProfile: (body: Partial<PatientProfile>) =>
      request<PatientProfile>("/patient/profile", { method: "PUT", body: JSON.stringify(body) }).then((p) => ({
        ...p,
        medications: p.currentMedications ?? p.medications ?? [],
      })),
    addMedication: (body: { name: string; salt?: string; dosage?: string; frequency?: string }) =>
      request<PatientProfile>("/patient/medications", { method: "POST", body: JSON.stringify(body) }).then((p) => ({
        ...p,
        medications: p.currentMedications ?? p.medications ?? [],
      })),
    removeMedication: (medId: string) =>
      request<PatientProfile>(`/patient/medications/${medId}`, { method: "DELETE" }).then((p) => ({
        ...p,
        medications: p.currentMedications ?? p.medications ?? [],
      })),
    parseReport: (file: File): Promise<ReportPreviewData> => {
      const fd = new FormData();
      fd.append("report", file);
      return fetch(`${BASE}/patient/parse-report`, {
        method: "POST",
        headers: { ...authHeaders() } as Record<string, string>,
        body: fd,
      }).then(async (r) => {
        const envelope = await r.json().catch(() => ({})) as ApiEnvelope<ReportPreviewData>;
        if (!r.ok) throw new Error(envelope.message ?? envelope.error ?? `HTTP ${r.status}`);
        return (envelope.data ?? envelope) as ReportPreviewData;
      });
    },
    resolveCondition: (conditionName: string) =>
      request<PatientProfile>(`/patient/conditions/${encodeURIComponent(conditionName)}/resolve`, {
        method: 'PATCH',
      }).then((p) => ({ ...p, medications: p.currentMedications ?? p.medications ?? [] })),
    saveConditionRecords: (records: Omit<ConditionRecord, '_id'>[]) =>
      request<PatientProfile>('/patient/condition-records', {
        method: 'POST',
        body: JSON.stringify({ records }),
      }).then((p) => ({ ...p, medications: p.currentMedications ?? p.medications ?? [] })),
    saveReportData: (data: any) =>
      request<PatientProfile>('/patient/report-data', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((p) => ({ ...p, medications: p.currentMedications ?? p.medications ?? [] })),
  },

  medicines: {
    search: (q: string) =>
      request<any[]>(`/medicines/search?q=${encodeURIComponent(q)}`).then(res => 
        res.map(r => ({
          id: r._id || r.id,
          name: r.brand_name || r.name || "Unknown Medicine",
          salt: r.composition || r.salt || "",
          manufacturer: r.manufacturer,
          price: r.price ? parseFloat(String(r.price).replace(/[^0-9.]/g, '')) || undefined : undefined
        }))
      ),
    scan: (file: File) => {
      const fd = new FormData();
      fd.append("image", file);
      return fetch(`${BASE}/medicines/scan`, {
        method: "POST",
        headers: { ...authHeaders() } as Record<string, string>,
        body: fd,
      }).then(async (r) => {
        const envelope = await r.json().catch(() => ({})) as ApiEnvelope<{ extracted: string[]; matched: unknown[]; unmatched: string[] }>;
        if (!r.ok) throw new Error(envelope.message ?? envelope.error ?? `HTTP ${r.status}`);
        const inner = envelope.data ?? (envelope as unknown as { extracted: string[]; matched: unknown[]; unmatched: string[] });
        // Map API shape { extracted, matched, unmatched } → { medicines, matched, unmatched }
        return {
          medicines: inner.extracted ?? [],
          matched: inner.matched ?? [],
          unmatched: inner.unmatched ?? [],
          rawText: (inner as { rawText?: string }).rawText,
        } as ScanResult;
      });
    },
    getDietaryAdvice: (name: string) =>
      request<DietaryAdviceResult>(`/medicines/dietary-advice/${encodeURIComponent(name)}`),
    getCombinedDietaryAdvice: (
      medicines: string[],
      conditionContext?: { condition: string; foodsToAvoid: string[]; foodsToEat: string[] }[]
    ) =>
      request<CombinedDietaryResult>('/medicines/combined-dietary-advice', {
        method: 'POST',
        body: JSON.stringify({ medicines, conditionContext }),
      }),
  },

  check: {
    run: (body: { medicines: string[] }) =>
      request<any>("/check", { method: "POST", body: JSON.stringify(body) }).then((res) => {
        const results = res.results || [];
        const mappedResults = results.map((r: any) => ({
          pair: [r.medicine, r.conflictsWith].filter(Boolean),
          medicine: r.medicine,
          conflictsWith: r.conflictsWith ?? null,
          severity: r.severity || "none",
          reason: r.reason || "",
          problem: r.problem || "",
          alternatives: r.alternatives || [],
          source: r.source || "",
          status: r.status,
        }));
        
        return {
          overallSafe: res.safe ?? true,
          summary: res.summary || "",
          results: mappedResults.filter((r: any) => r.severity !== "none" && r.status !== "banned"),
          bannedFound: Object.values(
            results.filter((r: any) => r.status === "banned").reduce((acc: any, r: any) => {
              if (!acc[r.reason]) acc[r.reason] = { medicines: [], reason: r.reason };
              if (!acc[r.reason].medicines.includes(r.medicine)) {
                acc[r.reason].medicines.push(r.medicine);
              }
              return acc;
            }, {})
          ),
          organWarnings: results
            .filter((r: any) => (r.reason?.toLowerCase().includes("liver") || r.reason?.toLowerCase().includes("kidney")) && r.status !== "banned")
            .map((r: any) => `${r.medicine}: ${r.reason}`),
        } as CheckResponse;
      }),
  },
};
