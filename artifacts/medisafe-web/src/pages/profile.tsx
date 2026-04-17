import { useState, useEffect } from "react";
import { api, type PatientProfile } from "@/lib/api";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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

  const [form, setForm] = useState({
    name: "",
    age: "",
    conditions: [] as string[],
    allergies: [] as string[],
    allergyInput: "",
  });

  useEffect(() => {
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

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your health information</p>
        </div>
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
                placeholder="Add allergy…"
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
    </div>
  );
}
