import { searchMedicines, resolveBrandName } from '../common/services/medicineIndex.js';
import { claude, HAIKU, SCAN_MODEL, REPORT_MODEL, isAnthropicConfigured } from '../common/services/claudeClient.js';
import { extractWithGemini, SCAN_PROMPT, parseScanEnvelope, type ScanExtraction } from '../common/services/geminiClient.js';
import { DietaryAdviceModel, CombinedDietaryAdviceModel } from '../check/check.schema.js';
import type { MedicineSearchResult, ScanResultDTO, ScanCorrection } from './medicines.dto.js';
import { calculateCost, type AiCost } from '../../lib/priceTracker.js';

export async function searchMedicinesByQuery(query: string): Promise<MedicineSearchResult[]> {
  return searchMedicines(query, 10);
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
  aiCosts: AiCost[];
}

export async function getDietaryAdvice(medicineName: string): Promise<DietaryAdviceResult> {
  const key = medicineName.trim().toLowerCase();
  const aiCosts: AiCost[] = [];

  // 1. Check cache first
  const cached = await DietaryAdviceModel.findOne({ medicineKey: key });
  if (cached) {
    return { medicine: medicineName, items: cached.items as DietaryAdviceItem[], cached: true, aiCosts };
  }

  // 2. Ask Claude
  if (!claude) {
    return { medicine: medicineName, items: [], cached: false, aiCosts };
  }

  const prompt = `You are a clinical pharmacist. A patient is taking "${medicineName}".
List the foods, drinks, and lifestyle factors they must avoid while taking this medicine.
Respond ONLY as a JSON array with this exact structure (no markdown, no code fences):
[
  { "category": "Foods", "avoid": ["item1", "item2"], "reason": "brief medical reason" },
  { "category": "Drinks", "avoid": ["item1"], "reason": "brief medical reason" },
  { "category": "Lifestyle", "avoid": ["item1"], "reason": "brief medical reason" }
]
Include only categories with actual items. Keep each item concise (2–5 words).`;

  const response = await claude.messages.create({
    model: HAIKU,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const cost = calculateCost(HAIKU, response.usage.input_tokens, response.usage.output_tokens);
  aiCosts.push({ model: HAIKU, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cost });

  const rawText = (response.content[0] as { text: string }).text.trim();
  let items: DietaryAdviceItem[] = [];

  try {
    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    items = JSON.parse(cleaned) as DietaryAdviceItem[];
  } catch {
    // fallback: empty items, store rawAdvice only
  }

  // 3. Cache for future requests
  await DietaryAdviceModel.create({ medicineKey: key, items, rawAdvice: rawText });

  return { medicine: medicineName, items, cached: false, aiCosts };
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
  aiCosts: AiCost[];
}

interface ConditionFoodContext {
  condition: string;
  foodsToAvoid: string[];
  foodsToEat: string[];
}

export async function getCombinedDietaryAdvice(
  medicines: string[],
  conditionContext?: ConditionFoodContext[]
): Promise<CombinedDietaryResult> {
  // v3: adds condition context to hash so different patients get different advice
  const conditionHash = (conditionContext ?? []).map(c => c.condition.toLowerCase()).sort().join('|');
  const hash = 'v3|' + medicines.map(m => m.trim().toLowerCase()).sort().join('|') + (conditionHash ? '|' + conditionHash : '');
  const aiCosts: AiCost[] = [];

  // 1. Check cache
  const cached = await CombinedDietaryAdviceModel.findOne({ medicinesHash: hash });
  if (cached) {
    return {
      medicines,
      avoid:        cached.avoid as CombinedAvoidItem[],
      safeToEat:    cached.safeToEat,
      mealSchedule: (cached.mealSchedule ?? []) as MealScheduleItem[],
      medicineTips: (cached.medicineTips ?? []) as MedicineTip[],
      generalTips:  cached.generalTips,
      cached: true,
      aiCosts,
    };
  }

  // 2. Ask Claude
  if (!claude) {
    return { medicines, avoid: [], safeToEat: [], mealSchedule: [], medicineTips: [], generalTips: [], cached: false, aiCosts };
  }

  const medList = medicines.join(', ');

  // Build condition-specific food warnings section
  let conditionSection = '';
  if (conditionContext && conditionContext.length > 0) {
    const activeConditions = conditionContext.filter(c => c.foodsToAvoid.length > 0 || c.foodsToEat.length > 0);
    if (activeConditions.length > 0) {
      conditionSection = `\n\nIMPORTANT — Patient-specific condition warnings (from their uploaded medical report):
${activeConditions.map(c => `- ${c.condition}: AVOID [${c.foodsToAvoid.join(', ')}] | SAFE: [${c.foodsToEat.join(', ')}]`).join('\n')}
You MUST include these condition-specific foods in the avoid list with reason citing the patient's condition.`;
    }
  }

  const prompt = `You are a clinical pharmacist writing advice for patients and caregivers in India.
A patient is taking all of these medicines together: ${medList}.

Your audience is a typical Indian household — they eat dal, roti, sabzi, rice, curd, idli, poha, khichdi, lassi. They do NOT eat salmon or kale.

IMPORTANT — flag Indian-specific risks if relevant:
- Karela (bitter gourd) potentiates blood sugar lowering with Metformin/glipizide
- Amla (Indian gooseberry) with blood thinners (warfarin, aspirin, clopidogrel) increases bleeding risk
- Ashwagandha with propranolol or sedatives can increase drowsiness
- Tulsi (holy basil) with blood thinners can increase bleeding
- Methi (fenugreek seeds) with diabetes medicines can cause very low blood sugar${conditionSection}

Respond ONLY as valid JSON (no markdown, no code fences):
{
  "avoid": [
    {
      "category": "Foods" | "Drinks" | "Supplements" | "Herbs & Home Remedies",
      "items": [
        { "name": "item name (2-4 words)", "severity": "high" | "moderate" | "low", "timingContext": "e.g. avoid for the full course" | "avoid within 2 hours of dose" | "avoid completely" }
      ],
      "reason": "1 plain sentence why — written for a non-medical reader"
    }
  ],
  "safeToEat": ["Indian food 1", "Indian food 2", "..."],
  "mealSchedule": [
    { "medicine": "medicine name", "timing": "before" | "after" | "empty_stomach" | "any", "note": "1 short plain sentence" }
  ],
  "medicineTips": [
    { "medicine": "medicine name", "tip": "1 short practical tip for this specific medicine" }
  ],
  "generalTips": ["overall tip applying to the whole regimen"]
}

Rules:
- safeToEat: 6-8 common Indian foods safe with all these medicines (e.g. dal, roti, curd, rice, poha, idli, khichdi, lassi, banana, coconut water)
- mealSchedule: one entry per medicine — tell the patient WHEN to take it relative to food
- medicineTips: 1 tip per medicine that is specific and actionable
- generalTips: 1-3 tips that apply across all medicines
- Keep all language simple — write as if explaining to someone with no medical training`;

  const response = await claude.messages.create({
    model: HAIKU,
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  const cost = calculateCost(HAIKU, response.usage.input_tokens, response.usage.output_tokens);
  aiCosts.push({ model: HAIKU, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cost });

  const rawText = (response.content[0] as { text: string }).text.trim();
  let avoid: CombinedAvoidItem[] = [];
  let safeToEat: string[] = [];
  let mealSchedule: MealScheduleItem[] = [];
  let medicineTips: MedicineTip[] = [];
  let generalTips: string[] = [];

  try {
    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as {
      avoid: CombinedAvoidItem[];
      safeToEat: string[];
      mealSchedule: MealScheduleItem[];
      medicineTips: MedicineTip[];
      generalTips: string[];
    };
    avoid        = parsed.avoid        ?? [];
    safeToEat    = parsed.safeToEat    ?? [];
    mealSchedule = parsed.mealSchedule ?? [];
    medicineTips = parsed.medicineTips ?? [];
    generalTips  = parsed.generalTips  ?? [];
  } catch {
    // return empty on parse failure
  }

  // 3. Save to cache
  await CombinedDietaryAdviceModel.create({ medicinesHash: hash, avoid, safeToEat, mealSchedule, medicineTips, generalTips });

  return { medicines, avoid, safeToEat, mealSchedule, medicineTips, generalTips, cached: false, aiCosts };
}

/**
 * Extracts medicine names from an image using a two-tier approach:
 *   1. Gemini 2.0 Flash (FREE tier, primary)
 *   2. Claude Haiku (cheap paid fallback — only when Gemini fails / times out)
 *
 * If Gemini *successfully* classifies the image as not_medicine or unclear,
 * we trust that result and do NOT fall through to Claude.
 */
export async function extractMedicinesFromImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ScanResultDTO> {
  const aiCosts: AiCost[] = [];

  // ── Tier 1: Gemini Flash (free) ─────────────────────────────────────────────
  let envelope: ScanExtraction | null = await extractWithGemini(imageBuffer, mimeType, aiCosts);

  if (envelope) {
    console.log(`[scan] ✅ Gemini classified as "${envelope.kind}" with ${envelope.medicines.length} medicines`);
  } else if (!isAnthropicConfigured) {
    console.warn('[scan] ⚠️  Neither Gemini nor Anthropic keys are configured — returning empty result');
    envelope = { kind: 'unclear', medicines: [], message: 'Image scanning is not configured on this server.' };
  } else {
    // ── Tier 2: Claude Haiku (paid fallback) ──────────────────────────────────
    console.log('[scan] 🔁 Gemini unavailable — falling back to Claude Haiku (paid)');
    const t0 = Date.now();
    envelope = await extractWithClaude(imageBuffer, mimeType, aiCosts, SCAN_MODEL);
    console.log(`[scan] ✅ Claude classified as "${envelope.kind}" with ${envelope.medicines.length} medicines (${Date.now() - t0}ms)`);
  }

  // ── Prescription upgrade: re-extract with Claude Sonnet (vision) ──────────
  // Handwritten prescriptions need a stronger vision model for accurate OCR.
  // Keep the original classification (kind), replace the medicines list.
  if (envelope.kind === 'prescription' && isAnthropicConfigured) {
    console.log('[scan] 🔍 Prescription detected — upgrading to Claude Sonnet for better OCR');
    const t0 = Date.now();
    const upgraded = await extractWithClaude(imageBuffer, mimeType, aiCosts, REPORT_MODEL);
    console.log(`[scan] ✅ Sonnet extracted ${upgraded.medicines.length} medicines (${Date.now() - t0}ms) — was ${envelope.medicines.length}`);
    // Trust Sonnet's medicines list; keep original kind/message
    if (upgraded.medicines.length > 0 || envelope.medicines.length === 0) {
      envelope = { ...envelope, medicines: upgraded.medicines };
    }
  }

  const rawExtracted = envelope.medicines;

  // ── Match each extracted name; fuzzy-correct unmatched ones ───────────────
  // OCR on handwriting often gives "Angformin" when the real brand is "Anafortan".
  // For each name with no exact hit, fuzzy-match against known brands and snap if close.
  const matched: Array<MedicineSearchResult & { confidence: number }> = [];
  const unmatched: string[] = [];
  const corrections: ScanCorrection[] = [];
  const finalExtracted: string[] = [];

  await Promise.all(
    rawExtracted.map(async (name, idx) => {
      try {
        const r = await resolveBrandName(name);
        if (r) {
          matched[idx] = { ...r.result, confidence: r.confidence === 'high' ? 0.95 : 0.7 };
          if (r.corrected) {
            corrections.push({ original: name, corrected: r.corrected, score: 0 });
            finalExtracted[idx] = r.corrected;
            console.log(`[scan] 🔧 corrected "${name}" → "${r.corrected}"`);
          } else {
            finalExtracted[idx] = name;
          }
          return;
        }
        // No safe match — keep raw name in the extracted list, user can confirm/edit
        unmatched.push(name);
        finalExtracted[idx] = name;
      } catch {
        unmatched.push(name);
        finalExtracted[idx] = name;
      }
    }),
  );

  return {
    kind: envelope.kind,
    message: envelope.message,
    extracted: finalExtracted.filter(Boolean),
    corrections,
    matched: matched.filter(Boolean),
    unmatched,
    aiCosts,
  };
}

/**
 * Claude vision extractor. Used as Gemini fallback (Haiku) AND as a prescription
 * upgrade step (Sonnet) for better handwriting OCR.
 */
async function extractWithClaude(
  imageBuffer: Buffer,
  mimeType: string,
  aiCosts: AiCost[],
  model: string,
): Promise<ScanExtraction> {
  if (!claude) {
    console.info('[scan:claude] ANTHROPIC_API_KEY not set — skipping Claude');
    return { kind: 'unclear', medicines: [], message: 'Image scanning is not configured on this server.' };
  }

  const base64 = imageBuffer.toString('base64');

  try {
    const response = await claude.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0,  // deterministic — same image → same output
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64,
              },
            },
            { type: 'text', text: SCAN_PROMPT },
          ],
        },
      ],
    });

    const rawText = (response.content[0] as { type: string; text: string }).text ?? '';
    console.log(`[scan:claude:${model}] raw response:`, rawText.slice(0, 300));

    const cost = calculateCost(model, response.usage.input_tokens, response.usage.output_tokens);
    aiCosts.push({ model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cost });

    const envelope = parseScanEnvelope(rawText);
    if (!envelope) {
      console.warn(`[scan:claude:${model}] could not parse envelope`);
      return { kind: 'unclear', medicines: [], message: 'Could not read the image. Please try again with a clearer photo.' };
    }
    return envelope;
  } catch (err: unknown) {
    const e = err as Error & { status?: number; headers?: unknown };
    console.error(`[scan:claude:${model}] API call failed —`, {
      name:    e?.name,
      message: e?.message,
      status:  e?.status,
    });
    return { kind: 'unclear', medicines: [], message: 'The scan service is temporarily unavailable. Please try again.' };
  }
}
