/**
 * patient.report.service.ts
 * ─────────────────────────
 * Parses a medical report (image or PDF) using Claude Sonnet 4.6 and resolves
 * extracted medicine names through the existing brand→salt MongoDB pipeline.
 *
 * SECURITY CONTRACT:
 *   - The raw file buffer is used only for the duration of the Claude API call.
 *   - Buffer content is NEVER logged (only byte-length and mimeType are logged).
 *   - No file is written to disk — multer memoryStorage only.
 *   - Raw report content is NOT stored in the database; only the extracted
 *     structured fields (conditions, medications, lab results, etc.) are saved.
 */

import { claude, REPORT_MODEL } from '../common/services/claudeClient.js';
import { resolveBrandName } from '../common/services/medicineIndex.js';
import { calculateCost, type AiCost } from '../../lib/priceTracker.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractedPatientInfo {
  name?: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
}

export interface ExtractedMedication {
  rawName: string;     // exactly as written in the report: "Tab. Augmentin 625"
  dosage?: string;
  frequency?: string;
}

export interface ResolvedMedication extends ExtractedMedication {
  resolvedName: string;    // brand_name from DB  — e.g. "Augmentin 625 Duo Tablet"
  resolvedSalt: string;    // composition from DB — e.g. "Amoxycillin (500mg) + Clavulanic Acid (125mg)"
  matchConfidence: 'high' | 'medium' | 'low';
  /** Set when fuzzy-correction was applied — e.g. "Angformin" → "Anafortan". UI should highlight. */
  corrected?: string;
}

export interface ExtractedLabResult {
  name: string;
  value: string;
  unit: string;
  status?: string;
  referenceRange?: string;
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
  reportDate?: string;             // YYYY-MM-DD extracted from report, if present
  reportSummary?: string;          // Plain-English explanation of findings
  reportAnalysis?: ReportAnalysis;  // Structured patient-facing interpretation
  patientInfo: ExtractedPatientInfo;
  conditions: string[];
  conditionInsights: ConditionInsight[];  // per-condition dietary + precaution guidance
  allergies: string[];
  medications: ResolvedMedication[];
  unresolvedMedications: ExtractedMedication[];  // names Claude found but DB couldn't match
  labResults: ExtractedLabResult[];
  aiCosts: AiCost[];
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const REPORT_EXTRACTION_PROMPT = `You are a clinical data extraction assistant. Extract ALL structured medical information from this report or prescription.

Return ONLY a JSON object with this exact structure (no markdown, no code fences):
{
  "reportDate": "YYYY-MM-DD or null",
  "reportSummary": "1-2 short patient-friendly sentences. Mention only the main issues and what the patient should discuss with a doctor. Do not list every normal test.",
  "reportAnalysis": {
    "overview": "A simple patient-friendly explanation of what seems wrong or reassuring in this report. Do not diagnose beyond the report evidence.",
    "keyFindings": [
      {
        "title": "Low haemoglobin",
        "evidence": "Several blood indices suggest low iron, including low MCV/MCH and low transferrin saturation.",
        "meaning": "This may explain tiredness, weakness, or breathlessness. Ask your doctor if iron treatment is needed.",
        "severity": "watch"
      }
    ],
    "foodsToEat": ["Dal", "Green leafy vegetables", "Amla", "Citrus fruits"],
    "foodsToAvoid": ["Tea or coffee with meals", "Sugary drinks"],
    "precautions": ["Do not stop prescribed medicines without asking your doctor", "Take the report to a doctor if symptoms continue"],
    "followUpQuestions": ["Ask your doctor whether iron or vitamin B12 tests are needed"],
    "urgentWarnings": ["Seek urgent care if there is chest pain, severe breathlessness, fainting, or confusion"]
  },
  "patientInfo": {
    "name": "patient name or null",
    "age": number or null,
    "gender": "male" | "female" | "other" | null,
    "bloodGroup": "A+" | "B+" | "O+" | "AB+" | "A-" | "B-" | "O-" | "AB-" | null
  },
  "conditions": ["Diabetes Type 2", "Hypertension"],
  "conditionInsights": [
    {
      "condition": "Iron Deficiency Anemia",
      "precautions": ["Avoid drinking tea or coffee within 1 hour of meals", "Take iron tablets with lemon juice (vitamin C) to improve absorption"],
      "foodsToAvoid": ["Tea", "Coffee", "Milk with iron supplements", "Uncooked spinach with dairy"],
      "foodsToEat": ["Spinach", "Lentils (dal)", "Jaggery (gud)", "Amla", "Citrus fruits", "Pomegranate"]
    }
  ],
  "allergies": ["Penicillin", "Sulfa drugs"],
  "medications": [
    {
      "rawName": "Tab. Augmentin 625",
      "dosage": "625mg",
      "frequency": "twice daily"
    }
  ],
  "labResults": [
    { "name": "HbA1c", "value": "7.2", "unit": "%", "status": "High", "referenceRange": "4.0 - 5.6" },
    { "name": "Serum Creatinine", "value": "1.1", "unit": "mg/dL", "status": "Normal", "referenceRange": "0.7 - 1.3" },
    { "name": "Haemoglobin", "value": "11.7", "unit": "g/dl", "status": "Low", "referenceRange": "12.0 - 15.0" }
  ]
}

Rules:
- reportDate: the date printed on the report/prescription (format YYYY-MM-DD). If not visible, use null
- reportSummary: essential for lab results; keep it brief and useful for a patient. Focus on the 2-3 main health issues only.
- reportAnalysis: essential. Explain what appears abnormal or important, what it may mean, practical food guidance, precautions, and follow-up questions. Keep it simple, specific, and safe for patients.
- keyFindings: return at most 5 findings. Do NOT include normal/reassuring findings. Combine related values into one finding (for example, group MCV, MCH, transferrin saturation, serum iron under "Possible iron deficiency"). Avoid detailed pathology jargon unless it changes what the patient should do next. Use severity only from: "watch", "needs_attention", "urgent".
- foodsToEat and foodsToAvoid: return at most 10 foods in each list. Tailor to the main findings and Indian diet. Avoid niche or overly technical diet advice.
- urgentWarnings: only list red-flag symptoms that should prompt urgent medical care; do not invent emergencies.
- Extract every medicine name exactly as written (brand name, dosage suffix, tablet/capsule prefix all included)
- labResults: Extract each lab value once only. Prefer the row that includes status/referenceRange. For status, strictly use "High", "Low", "Normal", or "Abnormal". If referenceRange is visible, extract it exactly.
- conditionInsights: write guidance only for the main actionable conditions. Do not create empty guidance entries.
  - foodsToAvoid: common Indian foods that worsen this condition or interact with its treatment (e.g. for diabetes: white rice, maida, sugary chai)
  - foodsToEat: Indian foods that are beneficial or safe for this condition (e.g. for diabetes: bitter gourd/karela, methi, dal, brown rice)
  - precautions: 2-4 practical, plain-language precautions a patient can follow at home
- If a field is not present in the document, use null for objects or [] for arrays
- conditions: diagnosed diseases/disorders only, not symptoms
- allergies: drug or food allergies explicitly mentioned
- Return only the JSON object, nothing else`;

// ── Core extraction functions ─────────────────────────────────────────────────

export interface ConditionInsight {
  condition: string;
  precautions: string[];
  foodsToAvoid: string[];
  foodsToEat: string[];
}

interface RawExtracted {
  reportDate?: string | null;
  reportSummary?: string | null;
  reportAnalysis?: ReportAnalysis | null;
  patientInfo: {
    name?: string | null;
    age?: number | null;
    gender?: string | null;
    bloodGroup?: string | null;
  };
  conditions: string[];
  conditionInsights?: ConditionInsight[];
  allergies: string[];
  medications: Array<{ rawName: string; dosage?: string; frequency?: string }>;
  labResults: Array<{ name: string; value: string; unit: string; status?: string; referenceRange?: string }>;
}

/**
 * Calls Claude Sonnet with an image buffer (JPEG, PNG, WEBP).
 */
async function extractFromImage(buffer: Buffer, mimeType: string, aiCosts: AiCost[]): Promise<RawExtracted> {
  if (!claude) throw new Error('Claude is not configured — set ANTHROPIC_API_KEY');

  const base64 = buffer.toString('base64');

  // Log only metadata, never content
  console.info('[report:claude] Sending image to Claude Sonnet —', {
    bytes: buffer.byteLength,
    mimeType,
  });

  const response = await claude.messages.create({
    model: REPORT_MODEL,
    max_tokens: 8192,
    stream: false,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
              data: base64,
            },
          },
          { type: 'text', text: REPORT_EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const cost = calculateCost(REPORT_MODEL, inputTokens, outputTokens);
  aiCosts.push({ model: REPORT_MODEL, inputTokens, outputTokens, cost });

  console.info('[report:claude] Claude Sonnet usage', {
    model: REPORT_MODEL,
    inputTokens,
    outputTokens,
    cost,
  });

  return parseClaudeResponse(response, aiCosts);
}

/**
 * Sends a PDF directly to Claude Sonnet using native PDF support (beta).
 * Works for BOTH text-layer PDFs and fully scanned/image-only PDFs.
 * Claude processes all pages — no page cap, no pdf-parse dependency.
 */
async function extractFromPdf(buffer: Buffer, aiCosts: AiCost[]): Promise<RawExtracted> {
  if (!claude) throw new Error('Claude is not configured — set ANTHROPIC_API_KEY');

  // Log only non-sensitive metadata
  console.info('[report:claude] Sending PDF to Claude Sonnet (native PDF vision) —', {
    bytes: buffer.byteLength,
  });

  const base64 = buffer.toString('base64');

  // Use beta.messages for native PDF support (handles both text and scanned PDFs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (claude.beta as any).messages.create({
    model: REPORT_MODEL,
    max_tokens: 8192,
    betas: ['pdfs-2024-09-25'],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          { type: 'text', text: REPORT_EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const cost = calculateCost(REPORT_MODEL, inputTokens, outputTokens);
  aiCosts.push({ model: REPORT_MODEL, inputTokens, outputTokens, cost });

  console.info('[report:claude] Claude Sonnet usage', {
    model: REPORT_MODEL,
    inputTokens,
    outputTokens,
    cost,
  });

  return parseClaudeResponse(response as { content: Array<{ type: string; text?: string }> }, aiCosts);
}

async function parseClaudeResponse(response: { content: Array<{ type: string; text?: string }> }, aiCosts: AiCost[]): Promise<RawExtracted> {
  const rawText = response.content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
    .trim();

  const parsed = parseJsonFromText(rawText);
  if (parsed) return parsed;

  const repaired = await repairJsonWithClaude(rawText, aiCosts);
  if (repaired) return repaired;

  console.warn('[report:claude] Failed to parse JSON response after repair attempt —', {
    length: rawText.length,
    startsWith: rawText.slice(0, 40).replace(/\s+/g, ' '),
    endsWith: rawText.slice(-40).replace(/\s+/g, ' '),
  });
  throw new Error('Claude could not return valid report data. Please try again with a clearer report image or PDF.');
}

function parseJsonFromText(rawText: string): RawExtracted | null {
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const candidates = [
    cleaned,
    ...extractBalancedJsonObjects(cleaned).sort((a, b) => b.length - a.length),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as RawExtracted;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function extractBalancedJsonObjects(text: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }

    if (char === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

async function repairJsonWithClaude(rawText: string, aiCosts: AiCost[]): Promise<RawExtracted | null> {
  if (!claude || rawText.length === 0) return null;

  try {
    const response = await claude.messages.create({
      model: REPORT_MODEL,
      max_tokens: 8192,
      stream: false,
      messages: [
        {
          role: 'user',
          content: `The text below was supposed to be a single JSON object for a medical report parser, but it is not valid JSON.

Return ONLY one valid JSON object. No markdown. No explanation.
Preserve the extracted medical values already present. Do not invent new findings.
The JSON object must contain these top-level keys:
reportDate, reportSummary, reportAnalysis, patientInfo, conditions, conditionInsights, allergies, medications, labResults.

Text to repair:
${rawText}`,
        },
      ],
    });

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const cost = calculateCost(REPORT_MODEL, inputTokens, outputTokens);
    aiCosts.push({ model: REPORT_MODEL, inputTokens, outputTokens, cost });

    console.info('[report:claude] Claude Sonnet repair usage', {
      model: REPORT_MODEL,
      inputTokens,
      outputTokens,
      cost,
    });

    const repairedText = response.content
      .filter((block) => block.type === 'text' && 'text' in block)
      .map((block) => (block as { text: string }).text)
      .join('\n');

    return parseJsonFromText(repairedText);
  } catch (err) {
    console.warn('[report:claude] JSON repair request failed —', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function normalizeReportAnalysis(raw: RawExtracted): ReportAnalysis | undefined {
  const analysis = raw.reportAnalysis;
  const fallbackSummary = raw.reportSummary ?? undefined;

  if (!analysis && !fallbackSummary) return undefined;

  const validSeverities = new Set(['watch', 'needs_attention', 'urgent']);
  const keyFindings = (analysis?.keyFindings ?? [])
    .filter((finding) => finding.title && finding.meaning)
    .filter((finding) => finding.severity !== 'normal')
    .map((finding) => ({
      title: finding.title,
      evidence: finding.evidence,
      meaning: finding.meaning,
      severity: validSeverities.has(finding.severity)
        ? finding.severity as 'watch' | 'needs_attention' | 'urgent'
        : 'watch',
    }))
    .slice(0, 5);

  return {
    overview: analysis?.overview || fallbackSummary || '',
    keyFindings,
    foodsToEat: uniqueStrings(analysis?.foodsToEat ?? []).slice(0, 10),
    foodsToAvoid: uniqueStrings(analysis?.foodsToAvoid ?? []).slice(0, 10),
    precautions: uniqueStrings(analysis?.precautions ?? []).slice(0, 6),
    followUpQuestions: uniqueStrings(analysis?.followUpQuestions ?? []).slice(0, 5),
    urgentWarnings: uniqueStrings(analysis?.urgentWarnings ?? []).slice(0, 3),
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = value.trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function labResultKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(total|serum|plasma|blood)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function labResultScore(lab: ExtractedLabResult): number {
  let score = 0;
  if (lab.referenceRange) score += 4;
  if (lab.status) score += 3;
  if (['high', 'low', 'abnormal'].includes(lab.status?.toLowerCase() ?? '')) score += 5;
  if (lab.unit) score += 1;
  return score;
}

function dedupeLabResults(labs: ExtractedLabResult[]): ExtractedLabResult[] {
  const byKey = new Map<string, ExtractedLabResult>();

  for (const lab of labs) {
    if (!lab.name || !lab.value) continue;
    const cleaned: ExtractedLabResult = {
      name: lab.name.trim(),
      value: String(lab.value).trim(),
      unit: lab.unit?.trim() ?? '',
      status: lab.status?.trim(),
      referenceRange: lab.referenceRange?.trim(),
    };
    const key = labResultKey(cleaned.name) || cleaned.name.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || labResultScore(cleaned) > labResultScore(existing)) {
      byKey.set(key, cleaned);
    }
  }

  return [...byKey.values()];
}

// ── Salt resolution ───────────────────────────────────────────────────────────

/**
 * Runs each extracted medicine name through the existing MongoDB brand→salt
 * resolver. Same pipeline used by /medicines/scan.
 */
async function resolveExtractedMedications(
  extracted: Array<{ rawName: string; dosage?: string; frequency?: string }>
): Promise<{ resolved: ResolvedMedication[]; unresolved: ExtractedMedication[] }> {
  const resolved: ResolvedMedication[] = [];
  const unresolved: ExtractedMedication[] = [];

  await Promise.all(
    extracted.map(async (med) => {
      try {
        const r = await resolveBrandName(med.rawName);
        if (r) {
          if (r.corrected) {
            console.log(`[report] 🔧 corrected "${med.rawName}" → "${r.corrected}"`);
          }
          resolved.push({
            rawName: med.rawName,
            dosage: med.dosage,
            frequency: med.frequency,
            resolvedName: r.result.brand_name ?? med.rawName,
            resolvedSalt: r.result.composition ?? '',
            matchConfidence: r.confidence,
            corrected: r.corrected,
          });
        } else {
          // No safe match — keep raw name; let user opt in to add as-is.
          // CRITICAL: never silently match to a dissimilar brand (safety: avoid
          // resolving "Mogilax" laxative to "Risen T" antipsychotic).
          unresolved.push(med);
        }
      } catch {
        unresolved.push(med);
      }
    })
  );

  return { resolved, unresolved };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Main entry point: accepts a file buffer + mimeType, returns structured
 * preview data ready for the frontend confirmation step.
 *
 * Nothing is written to the database here — the caller (controller) is
 * responsible for saving only after user confirmation.
 */
export async function parseReportFile(
  buffer: Buffer,
  mimeType: string
): Promise<ReportPreviewData> {
  const isPdf = mimeType === 'application/pdf';
  const aiCosts: AiCost[] = [];

  // Extract raw data via Claude
  const raw = isPdf
    ? await extractFromPdf(buffer, aiCosts)
    : await extractFromImage(buffer, mimeType, aiCosts);

  // Resolve medicine names through brand→salt pipeline
  const { resolved, unresolved } = await resolveExtractedMedications(
    raw.medications ?? []
  );

  // Sanitize patientInfo — strip nulls
  const patientInfo: ExtractedPatientInfo = {};
  if (raw.patientInfo?.name) patientInfo.name = raw.patientInfo.name;
  if (raw.patientInfo?.age) patientInfo.age = raw.patientInfo.age;
  if (raw.patientInfo?.gender) patientInfo.gender = raw.patientInfo.gender;
  if (raw.patientInfo?.bloodGroup) patientInfo.bloodGroup = raw.patientInfo.bloodGroup;

  return {
    reportDate: raw.reportDate ?? undefined,
    reportSummary: raw.reportSummary ?? undefined,
    reportAnalysis: normalizeReportAnalysis(raw),
    patientInfo,
    conditions: (raw.conditions ?? []).filter(Boolean),
    conditionInsights: (raw.conditionInsights ?? [])
      .filter((ci) => ci.condition)
      .filter((ci) =>
        (ci.precautions?.length ?? 0) > 0 ||
        (ci.foodsToAvoid?.length ?? 0) > 0 ||
        (ci.foodsToEat?.length ?? 0) > 0
      )
      .slice(0, 5),
    allergies: (raw.allergies ?? []).filter(Boolean),
    medications: resolved,
    unresolvedMedications: unresolved,
    labResults: dedupeLabResults((raw.labResults ?? []).filter((l) => l.name && l.value).map((l) => ({
      name: l.name,
      value: l.value,
      unit: l.unit,
      status: l.status,
      referenceRange: l.referenceRange,
    }))),
    aiCosts,
  };
}
