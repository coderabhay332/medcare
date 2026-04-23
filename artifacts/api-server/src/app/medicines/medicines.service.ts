import { searchMedicines } from '../common/services/medicineIndex.js';
import { claude, HAIKU, SCAN_MODEL, isAnthropicConfigured } from '../common/services/claudeClient.js';
import { extractWithGemini, SCAN_PROMPT } from '../common/services/geminiClient.js';
import { DietaryAdviceModel, CombinedDietaryAdviceModel } from '../check/check.schema.js';
import type { MedicineSearchResult, ScanResultDTO } from './medicines.dto.js';
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
 *   1. Gemini 1.5/2.0 Flash (FREE tier, primary)
 *   2. Claude 3.5 Haiku (cheap paid fallback if Gemini fails or is unconfigured)
 */
export async function extractMedicinesFromImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ScanResultDTO> {
  let extracted: string[] = [];
  const aiCosts: AiCost[] = [];

  // ── Tier 1: Gemini Flash (free) ─────────────────────────────────────────────
  const geminiResult = await extractWithGemini(imageBuffer, mimeType, aiCosts);

  if (geminiResult !== null) {
    console.log('[scan] Using Gemini Flash result — free tier');
    extracted = geminiResult;
  } else if (!isAnthropicConfigured) {
    console.warn('[scan] Neither Gemini nor Anthropic keys are configured — returning empty result');
  } else {
    // ── Tier 2: Claude Haiku (paid fallback) ──────────────────────────────────
    console.log('[scan] Gemini unavailable — falling back to Claude Haiku');
    extracted = await extractWithClaude(imageBuffer, mimeType, aiCosts);
  }

  // ── Match each extracted name against MongoDB ──────────────────────────────
  const matched: Array<MedicineSearchResult & { confidence: number }> = [];
  const unmatched: string[] = [];

  await Promise.all(
    extracted.map(async name => {
      try {
        const results = await searchMedicines(name, 1);
        if (results.length > 0) {
          matched.push({ ...results[0], confidence: 0.9 });
        } else {
          unmatched.push(name);
        }
      } catch {
        unmatched.push(name);
      }
    }),
  );

  return { extracted, matched, unmatched, aiCosts };
}

/**
 * Claude Haiku fallback extractor — paid but cheap ($0.80/1M tokens).
 * Used when Gemini is not configured or returns an error.
 */
async function extractWithClaude(imageBuffer: Buffer, mimeType: string, aiCosts: AiCost[]): Promise<string[]> {
  if (!claude) {
    console.info('[scan:claude] ANTHROPIC_API_KEY not set — skipping Claude');
    return [];
  }

  const base64 = imageBuffer.toString('base64');

  try {
    const response = await claude.messages.create({
      model: SCAN_MODEL,
      max_tokens: 1024,
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
            {
              type: 'text',
              text: SCAN_PROMPT,
            },
          ],
        },
      ],
    });

    const rawText = (response.content[0] as { type: string; text: string }).text ?? '';

    // Strip markdown code fences if Claude wraps in ```json ... ```
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    console.log('[scan:claude] raw response:', rawText.slice(0, 300));

    const parsed = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(parsed)) {
      console.warn('[scan:claude] Did not return an array, got:', typeof parsed);
      return [];
    }

    const cost = calculateCost(SCAN_MODEL, response.usage.input_tokens, response.usage.output_tokens);
    aiCosts.push({ model: SCAN_MODEL, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cost });

    return parsed as string[];
  } catch (err: unknown) {
    const e = err as Error & { status?: number; headers?: unknown };
    console.error('[scan:claude] API call failed —', {
      name:    e?.name,
      message: e?.message,
      status:  e?.status,
      stack:   e?.stack?.split('\n').slice(0, 5).join('\n'),
    });
    return [];
  }
}
