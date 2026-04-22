import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Pill, AlertCircle, ArrowRight, ArrowLeft, Check, Eye, EyeOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

const COMMON_CONDITIONS = [
  "Diabetes", "Hypertension", "Liver Disease", "Kidney Disease",
  "Heart Disease", "Asthma", "Thyroid Disorder", "Epilepsy", "Pregnancy",
];

const STEP_LABELS = ["Account", "Health Profile", "Medications & Allergies"];

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    age: "",
    conditions: [] as string[],
    allergies: [] as string[],
    allergyInput: "",
  });

  const updateField = (k: string, v: string | string[]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleCondition = (c: string) => {
    setForm((f) => ({
      ...f,
      conditions: f.conditions.includes(c)
        ? f.conditions.filter((x) => x !== c)
        : [...f.conditions, c],
    }));
  };

  const addAllergy = () => {
    const val = form.allergyInput.trim();
    if (val && !form.allergies.includes(val)) {
      setForm((f) => ({ ...f, allergies: [...f.allergies, val], allergyInput: "" }));
    }
  };

  const removeAllergy = (a: string) =>
    setForm((f) => ({ ...f, allergies: f.allergies.filter((x) => x !== a) }));

  const handleNext = () => {
    setError("");
    if (step === 0) {
      if (!form.name.trim()) return setError("Name is required.");
      if (!form.email.trim()) return setError("Email is required.");
      if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    }
    setStep((s) => s + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        age: form.age ? Number(form.age) : undefined,
        conditions: form.conditions,
        allergies: form.allergies,
      });
      setLocation("/");
    } catch (err) {
      setError((err as Error).message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Pill className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-foreground">MediSafe</span>
        </div>

        {/* Step indicator */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
          <div className="flex items-center gap-2 mt-4">
            {STEP_LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all",
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <div className={cn("text-xs font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>
                  {label}
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={cn("h-0.5 flex-1 rounded-full", i < step ? "bg-primary" : "bg-muted")} />
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Step 0: Account */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Full name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="Aarav Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email address</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleNext}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm shadow-sm hover:opacity-90 transition-all"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 1: Health Profile */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Age (optional)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.age}
                  onChange={(e) => updateField("age", e.target.value)}
                  placeholder="e.g. 35"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Pre-existing conditions (optional)</label>
                <p className="text-xs text-muted-foreground">Select all that apply — helps personalise safety alerts</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {COMMON_CONDITIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCondition(c)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        form.conditions.includes(c)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border hover:border-primary/50"
                      )}
                    >
                      {form.conditions.includes(c) && <Check className="inline w-3 h-3 mr-1 -mt-0.5" />}
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent transition-all"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm shadow-sm hover:opacity-90 transition-all"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Allergies */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Drug allergies (optional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.allergyInput}
                    onChange={(e) => setForm((f) => ({ ...f, allergyInput: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAllergy())}
                    placeholder="e.g. Penicillin, Aspirin…"
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                  <button
                    type="button"
                    onClick={addAllergy}
                    className="px-4 py-2.5 rounded-xl bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/20 transition-all"
                  >
                    Add
                  </button>
                </div>
                {form.allergies.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {form.allergies.map((a) => (
                      <span key={a} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20">
                        {a}
                        <button type="button" onClick={() => removeAllergy(a)} className="hover:opacity-70">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent transition-all"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm shadow-sm hover:opacity-90 disabled:opacity-60 transition-all"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Create account <Check className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>

        {step === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
