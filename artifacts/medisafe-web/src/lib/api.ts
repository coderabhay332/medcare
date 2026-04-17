const BASE = "/api";

export interface AuthTokens {
  token: string;
  user: {
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

export interface PatientProfile {
  _id: string;
  name: string;
  email: string;
  age?: number;
  weight?: number;
  conditions: string[];
  allergies: string[];
  medications: Medication[];
  createdAt: string;
}

export interface CheckResultItem {
  pair: [string, string];
  severity: "none" | "mild" | "moderate" | "severe";
  reason: string;
  source: string;
}

export interface CheckResponse {
  overallSafe: boolean;
  bannedFound: string[];
  results: CheckResultItem[];
  organWarnings: string[];
  summary: string;
}

export interface ScanResult {
  medicines: string[];
  rawText: string;
}

function getToken(): string | null {
  return localStorage.getItem("medisafe_token");
}

function authHeaders(): HeadersInit {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  auth: {
    register: (body: { name: string; email: string; password: string; age?: number; conditions?: string[]; allergies?: string[] }) =>
      request<AuthTokens>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
    login: (body: { email: string; password: string }) =>
      request<AuthTokens>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  },

  patient: {
    getProfile: () => request<PatientProfile>("/patient/profile"),
    updateProfile: (body: Partial<PatientProfile>) =>
      request<PatientProfile>("/patient/profile", { method: "PUT", body: JSON.stringify(body) }),
    addMedication: (body: { name: string; salt?: string; dosage?: string; frequency?: string }) =>
      request<PatientProfile>("/patient/medications", { method: "POST", body: JSON.stringify(body) }),
    removeMedication: (medId: string) =>
      request<PatientProfile>(`/patient/medications/${medId}`, { method: "DELETE" }),
  },

  medicines: {
    search: (q: string) =>
      request<{ results: MedicineSearchResult[] }>(`/medicines/search?q=${encodeURIComponent(q)}`),
    scan: (file: File) => {
      const fd = new FormData();
      fd.append("image", file);
      return fetch(`${BASE}/medicines/scan`, {
        method: "POST",
        headers: { ...authHeaders() } as Record<string, string>,
        body: fd,
      }).then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((d as { message?: string }).message ?? `HTTP ${r.status}`);
        return d as ScanResult;
      });
    },
  },

  check: {
    run: (body: { medicines: string[] }) =>
      request<CheckResponse>("/check", { method: "POST", body: JSON.stringify(body) }),
  },
};
