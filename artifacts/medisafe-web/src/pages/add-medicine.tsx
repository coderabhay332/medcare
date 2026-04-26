import { useState, useRef, useCallback } from "react";
import { api, type MedicineSearchResult, type PatientProfile } from "@/lib/api";
import {
  Search,
  Camera,
  PenLine,
  Pill,
  CheckCircle,
  AlertCircle,
  Loader2,
  Upload,
  X,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Form } from "@/components/ui/form";

type Tab = "search" | "scan" | "manual";

export default function AddMedicinePage() {
  const [tab, setTab] = useState<Tab>("search");

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Add Medicine</h1>
        <p className="text-muted-foreground text-sm mt-1">Search, scan a label, or enter details manually</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl">
        {(
          [
            { id: "search", label: "Search", icon: Search },
            { id: "scan", label: "Scan Label", icon: Camera },
            { id: "manual", label: "Manual Entry", icon: PenLine },
          ] as { id: Tab; label: string; icon: typeof Search }[]
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all",
              tab === id
                ? "bg-card shadow-xs text-foreground border border-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "search" && <SearchTab />}
      {tab === "scan" && <ScanTab />}
      {tab === "manual" && <ManualTab />}
    </div>
  );
}

function SearchTab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MedicineSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.medicines.search(q);
        setResults(data ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, []);

  const handleAdd = async (med: MedicineSearchResult) => {
    setError("");
    setSuccess("");
    try {
      await api.patient.addMedication({ name: med.name, salt: med.salt });
      setAdded((s) => new Set([...s, med.id]));
      setSuccess(`${med.name} added to your profile!`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {success && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); doSearch(e.target.value); }}
          placeholder="Search by medicine name or salt…"
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
        {loading && (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((med) => (
            <div key={med.id} className="flex items-center gap-4 p-4 bg-card border border-card-border rounded-xl hover:border-primary/30 transition-all">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Pill className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{med.name}</p>
                <p className="text-xs text-muted-foreground truncate">{med.salt ?? "—"}</p>
                {med.manufacturer && (
                  <p className="text-xs text-muted-foreground/70 truncate">{med.manufacturer}</p>
                )}
              </div>
              {med.price && (
                <span className="text-xs text-muted-foreground shrink-0">₹{med.price}</span>
              )}
              <button
                onClick={() => handleAdd(med)}
                disabled={added.has(med.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  added.has(med.id)
                    ? "bg-primary/10 text-primary cursor-default"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                )}
              >
                {added.has(med.id) ? (
                  <><CheckCircle className="w-3.5 h-3.5" /> Added</>
                ) : (
                  <><Plus className="w-3.5 h-3.5" /> Add</>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && query.trim() && results.length === 0 && (
        <div className="text-center py-8">
          <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No medicines found for "{query}"</p>
          <p className="text-xs text-muted-foreground mt-1">Try the Manual Entry tab to add it directly</p>
        </div>
      )}
    </div>
  );
}

function ScanTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState<string[]>([]);
  const [corrections, setCorrections] = useState<{ original: string; corrected: string }[]>([]);
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [success, setSuccess] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setScanned([]);
    setCorrections([]);
    setRawText("");
    setError("");
    setNotice("");
  };

  const handleScan = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await api.medicines.scan(file);
      console.log('[scan] response:', res);
      setScanned(res.medicines ?? []);
      setCorrections(res.corrections ?? []);
      setRawText(res.rawText ?? "");

      if ((res.medicines?.length ?? 0) === 0) {
        setNotice(res.message ?? "We couldn't find any medicines in this image. Please upload a clearer photo of a medicine label or prescription.");
      } else if (res.kind === "prescription") {
        setNotice(`Detected a prescription — extracted ${res.medicines.length} medicine${res.medicines.length === 1 ? "" : "s"}. Patient/doctor details were ignored.`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const addScanned = async (name: string) => {
    try {
      await api.patient.addMedication({ name });
      setAdded((s) => new Set([...s, name]));
      setSuccess(`${name} added!`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
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
      {notice && !error && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {notice}
        </div>
      )}

      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
      >
        {preview ? (
          <div className="relative inline-block">
            <img src={preview} alt="Preview" className="max-h-48 rounded-xl mx-auto object-contain" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); setScanned([]); }}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Upload medicine label photo</p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {file && (
        <button
          onClick={handleScan}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm shadow-sm hover:opacity-90 disabled:opacity-60 transition-all"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {loading ? "Scanning with AI…" : "Scan Label"}
        </button>
      )}

      {corrections.length > 0 && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 text-xs space-y-1.5">
          <div className="font-semibold text-blue-700 dark:text-blue-300">Auto-corrected from your prescription</div>
          {corrections.map((c) => (
            <div key={c.original} className="text-muted-foreground">
              <span className="line-through">{c.original}</span>
              {" → "}
              <span className="font-medium text-foreground">{c.corrected}</span>
            </div>
          ))}
          <div className="text-[10px] text-muted-foreground/80 pt-1">
            Handwriting can be hard to read. Please verify each name before adding.
          </div>
        </div>
      )}

      {scanned.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-foreground">Detected medicines</h3>
          {scanned.map((name) => (
            <div key={name} className="flex items-center gap-3 p-3.5 bg-card border border-card-border rounded-xl">
              <Pill className="w-4 h-4 text-primary shrink-0" />
              <span className="flex-1 text-sm font-medium text-foreground">{name}</span>
              <button
                onClick={() => addScanned(name)}
                disabled={added.has(name)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  added.has(name)
                    ? "bg-primary/10 text-primary"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                )}
              >
                {added.has(name) ? "Added ✓" : "Add"}
              </button>
            </div>
          ))}
        </div>
      )}

      {rawText && (
        <details className="rounded-xl border border-border overflow-hidden">
          <summary className="px-4 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent">
            Raw extracted text
          </summary>
          <pre className="px-4 py-3 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/50">{rawText}</pre>
        </details>
      )}
    </div>
  );
}

function ManualTab() {
  const [form, setForm] = useState({ name: "", salt: "", dosage: "", frequency: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Medicine name is required.");
    setError("");
    setLoading(true);
    try {
      await api.patient.addMedication({
        name: form.name,
        salt: form.salt || undefined,
        dosage: form.dosage || undefined,
        frequency: form.frequency || undefined,
      });
      setSuccess(`${form.name} added to your profile!`);
      setForm({ name: "", salt: "", dosage: "", frequency: "" });
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const field = (
    id: keyof typeof form,
    label: string,
    placeholder: string,
    required = false
  ) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        {label} {!required && <span className="text-muted-foreground font-normal">(optional)</span>}
      </label>
      <input
        type="text"
        value={form[id]}
        onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
        placeholder={placeholder}
        required={required}
        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      />
    </div>
  );

  return (
    <Form onSubmit={handleSubmit} className="space-y-4">
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

      {field("name", "Medicine name", "e.g. Metformin 500mg", true)}
      {field("salt", "Active ingredient / salt", "e.g. Metformin Hydrochloride")}
      {field("dosage", "Dosage", "e.g. 500mg twice daily")}
      {field("frequency", "Frequency", "e.g. After meals, morning & night")}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm shadow-sm hover:opacity-90 disabled:opacity-60 transition-all"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {loading ? "Adding…" : "Add Medicine"}
      </button>
    </Form>
  );
}
