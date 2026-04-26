import { GoogleGenerativeAI } from '@google/generative-ai';
import { calculateCost, type AiCost } from '../../../lib/priceTracker.js';

// Uses Google Gemini API key from environment variables:
//   GEMINI_API_KEY — get yours free at https://aistudio.google.com/app/apikey
//
// Free tier limits (as of 2025):
//   gemini-1.5-flash — 15 RPM, 1 million TPM, 1,500 RPD — completely free
//   gemini-2.0-flash — same generous free tier
//
// No credit card required for free tier usage.

const apiKey = process.env['GEMINI_API_KEY'];

/** Whether Gemini is configured (key present and not placeholder) */
export const isGeminiConfigured =
  Boolean(apiKey) && apiKey !== 'your-gemini-api-key-here';

/** Google Generative AI client — only instantiated if key is configured */
export const genAI = isGeminiConfigured ? new GoogleGenerativeAI(apiKey!) : null;

// ── Model choice ──────────────────────────────────────────────────────────────
// We try a list of models in order; first one that doesn't 404/429 wins.
// Different free-tier API keys have access to different subsets of models, so
// hard-coding a single model breaks easily. Override the whole list via the
// GEMINI_MODELS env (comma-separated), or a single model via GEMINI_MODEL.
const DEFAULT_MODELS = [
  'gemini-2.5-flash-lite',  // newest, no thinking, fastest if available
  'gemini-2.5-flash',       // widely available; thinking-on but tolerable
  'gemini-2.0-flash',       // 2.0 generation
  'gemini-flash-latest',    // alias fallback
];
const GEMINI_MODELS: string[] = process.env['GEMINI_MODELS']
  ? process.env['GEMINI_MODELS']!.split(',').map(s => s.trim()).filter(Boolean)
  : process.env['GEMINI_MODEL']
    ? [process.env['GEMINI_MODEL']!]
    : DEFAULT_MODELS;
export const GEMINI_MODEL = GEMINI_MODELS[0]; // exported for cost tracker / logs

/** Hard timeout for a single Gemini call (ms). Falls back to Claude on timeout. */
const GEMINI_TIMEOUT_MS = Number(process.env['GEMINI_TIMEOUT_MS'] ?? 18000);

export type ScanKind = 'medicine_label' | 'prescription' | 'not_medicine' | 'unclear';

export interface ScanExtraction {
  kind: ScanKind;
  medicines: string[];
  /** User-facing one-liner. Required when medicines is empty. */
  message?: string;
}

/** The prompt used to extract medicine names from an image. Shared with Claude fallback. */
export const SCAN_PROMPT = `You are extracting medicine names from an image. Reply ONLY with a JSON object — no markdown, no code fences, no explanation.

JSON shape:
{
  "kind": "medicine_label" | "prescription" | "not_medicine" | "unclear",
  "medicines": ["Brand 1", "Brand 2"],
  "message": "short user-facing reason — required only when medicines is empty"
}

Classification rules:
- "medicine_label": the image clearly shows medicine packaging, strip, bottle, or box. List EVERY medicine/brand name visible.
- "prescription": the image is a doctor's prescription (Rx). Extract ONLY the prescribed medicine names. IGNORE patient name, doctor name, hospital, date, dosage, frequency, diagnosis, signature.
- "not_medicine": the image is not a medicine label or prescription (e.g. a person, food, random object, unrelated document). medicines must be []. message must explain in one short sentence (e.g. "This looks like a food photo, not a medicine label.").
- "unclear": image is too blurry, dark, cropped, or rotated to read reliably. medicines must be []. message must ask the user to retake the photo (e.g. "The image is too blurry to read — please take a clearer photo of the medicine label.").

Output rules:
- Use the medicine name exactly as printed (brand or generic). Keep printed strengths that are part of the brand (e.g. "Dolo 650").
- Do NOT include dosage instructions, patient details, or any text outside the JSON.`;

/**
 * Extracts medicines from an image using Gemini Flash (free tier).
 * Returns null only when Gemini is unconfigured / errors / times out — caller
 * should then try Claude. A successfully classified "not_medicine" or "unclear"
 * is returned as a real envelope (don't fall back).
 */
export async function extractWithGemini(
  imageBuffer: Buffer,
  mimeType: string,
  aiCosts: AiCost[]
): Promise<ScanExtraction | null> {
  if (!genAI) {
    console.info('[scan:gemini] GEMINI_API_KEY not set — skipping Gemini');
    return null;
  }

  for (const modelName of GEMINI_MODELS) {
    const result = await tryGeminiModel(modelName, imageBuffer, mimeType, aiCosts);
    if (result === 'next') continue;       // 404/429 — try next model
    if (result === 'fail') return null;    // hard error — fall back to Claude
    return result;                          // success
  }

  console.warn(`[scan:gemini] ❌ all ${GEMINI_MODELS.length} models failed (${GEMINI_MODELS.join(', ')}) — falling back to Claude.`);
  return null;
}

/** Returns 'next' to try the next model, 'fail' to give up, or a parsed envelope on success. */
async function tryGeminiModel(
  modelName: string,
  imageBuffer: Buffer,
  mimeType: string,
  aiCosts: AiCost[],
): Promise<ScanExtraction | 'next' | 'fail'> {
  try {
    const model = genAI!.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    });

    const generatePromise = model.generateContent([
      SCAN_PROMPT,
      {
        inlineData: {
          mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data: imageBuffer.toString('base64'),
        },
      },
    ]);

    const result = await Promise.race([
      generatePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini timeout after ${GEMINI_TIMEOUT_MS}ms`)), GEMINI_TIMEOUT_MS),
      ),
    ]);

    const rawText = result.response.text() ?? '';
    console.log(`[scan:gemini] ✅ ${modelName} raw response:`, rawText.slice(0, 300));

    const envelope = parseScanEnvelope(rawText);
    if (!envelope) {
      console.warn(`[scan:gemini] ${modelName} could not parse envelope — trying next model`);
      return 'next';
    }

    const cost = calculateCost(modelName, 0, 0);
    aiCosts.push({ model: modelName, inputTokens: 0, outputTokens: 0, cost });
    return envelope;
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    const isRetryable = e?.status === 404 || e?.status === 429 || e?.status === 503;
    const reason =
      e?.status === 404                 ? 'not available (404)' :
      e?.status === 429                 ? 'quota/rate-limit (429)' :
      /timeout/i.test(e?.message ?? '') ? `timeout (${GEMINI_TIMEOUT_MS}ms)` :
      e?.status                          ? `HTTP ${e.status}` :
                                           e?.name ?? 'unknown error';
    console.warn(`[scan:gemini] ⚠️  ${modelName} failed — ${reason}${isRetryable ? ' — trying next model' : ''}`);
    console.debug('[scan:gemini] error detail:', { name: e?.name, message: e?.message, status: e?.status });
    return isRetryable ? 'next' : 'fail';
  }
}

/**
 * Parses the scan envelope from raw model output. Tolerates markdown fences
 * (Claude can still wrap; Gemini with responseMimeType:json should not).
 * Returns null on any structural failure.
 */
export function parseScanEnvelope(rawText: string): ScanExtraction | null {
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  if (!cleaned) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  // Tolerate older array-of-strings shape for backwards compat
  if (Array.isArray(parsed)) {
    return {
      kind: parsed.length > 0 ? 'medicine_label' : 'unclear',
      medicines: parsed.filter((x): x is string => typeof x === 'string'),
      message: parsed.length === 0 ? 'No medicine names were detected. Please upload a clearer photo.' : undefined,
    };
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  const kind = p['kind'];
  const medicines = Array.isArray(p['medicines']) ? (p['medicines'] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const message = typeof p['message'] === 'string' ? p['message'] : undefined;

  const validKinds: ScanKind[] = ['medicine_label', 'prescription', 'not_medicine', 'unclear'];
  if (typeof kind !== 'string' || !validKinds.includes(kind as ScanKind)) {
    // Best-effort fallback: if we have medicines, treat as label; otherwise unclear
    return {
      kind: medicines.length > 0 ? 'medicine_label' : 'unclear',
      medicines,
      message: medicines.length === 0 ? (message ?? 'Could not classify the image. Please try again.') : undefined,
    };
  }

  return { kind: kind as ScanKind, medicines, message };
}
