import { parseSalts } from '../common/helper/saltParser.js';
import { checkBanned } from '../common/helper/bannedChecker.js';
import { claude, HAIKU } from '../common/services/claudeClient.js';
import { checkRxNavBySalts } from '../common/services/rxnavClient.js';
import { getPatientById } from '../patient/patient.service.js';
import {
  CheckHistoryModel,
  BannedExplanationModel,
} from './check.schema.js';
import { getMedicineByBrand } from '../common/services/medicineIndex.js';
import type { CheckRequestDTO, CheckResponseDTO, CheckResultItem } from './check.dto.js';
import { logger } from '../../lib/logger.js';
import { calculateCost, type AiCost } from '../../lib/priceTracker.js';

interface InteractionResult {
  interacts: boolean;
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  reason: string;
  problem: string;
  alternatives: string[];
}

function isSafetyAdviceRecord(
  advice: string | Record<string, string> | undefined,
): advice is Record<string, string> {
  return Boolean(advice) && typeof advice === 'object';
}

async function checkOpenFDA(saltA: string, saltB: string): Promise<string | null> {
  try {
    const url = `https://api.fda.gov/drug/label.json?search=drug_interactions:${encodeURIComponent(saltA)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json() as {
      results?: Array<{ drug_interactions?: string[] }>;
    };
    const interactions = data.results?.[0]?.drug_interactions?.[0] ?? '';
    const lower = interactions.toLowerCase();
    if (lower.includes(saltB.toLowerCase())) {
      return interactions;
    }
    return null;
  } catch {
    return null;
  }
}

async function checkInteractionClaude(
  saltA: string,
  saltB: string,
  conditions: string[],
  aiCosts: AiCost[]
): Promise<InteractionResult> {
  if (!claude) {
    return { interacts: false, severity: 'none', reason: '', problem: '', alternatives: [] };
  }

  try {
    const response = await claude.messages.create({
      model: HAIKU,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `You are a medicine safety helper writing for patients and caregivers in India who may not have a medical background.

Do ${saltA} and ${saltB} interact? Patient conditions: ${conditions.join(', ') || 'none'}.

Write in simple, everyday English that anyone can understand. Avoid all medical jargon. Use short sentences.

Reply ONLY as valid JSON with no markdown:
{
  "interacts": boolean,
  "severity": "none"|"mild"|"moderate"|"severe",
  "reason": "1 simple sentence — what the problem is (e.g. 'These two medicines can affect how well each other works.')",
  "problem": "1-2 plain sentences — what might happen to the patient if taken together (e.g. 'Your blood pressure medicine may not work as well. You might feel dizzy or your heart rate may change.')",
  "alternatives": ["simple tip 1 (e.g. 'Take them at least 2 hours apart')", "tip 2", "tip 3"]
}
For alternatives, give 2-3 easy, actionable tips a caregiver can follow — timing gaps, what to watch for, when to call the doctor. If no interaction, set interacts to false and leave problem and alternatives empty.`,
        },
      ],
    });

    const cost = calculateCost(HAIKU, response.usage.input_tokens, response.usage.output_tokens);
    aiCosts.push({ model: HAIKU, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cost });

    const text = (response.content[0] as { text: string }).text.trim();
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned) as InteractionResult;
  } catch {
    return { interacts: false, severity: 'none', reason: '', problem: '', alternatives: [] };
  }
}

async function getInteractionAlternatives(
  saltA: string,
  saltB: string,
  brandA: string,
  brandB: string,
  aiCosts: AiCost[]
): Promise<{ problem: string; alternatives: string[] }> {
  if (!claude) return { problem: '', alternatives: [] };
  try {
    const response = await claude.messages.create({
      model: HAIKU,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `You are a medicine safety helper writing for patients and caregivers in India.

${brandA} (${saltA}) and ${brandB} (${saltB}) may have a known interaction.

Write in simple, everyday language that a person with no medical training can understand.

Reply ONLY as valid JSON with no markdown:
{
  "problem": "1-2 plain sentences explaining what might happen to the patient (avoid medical jargon — use words like 'may feel dizzy', 'blood pressure may rise', 'medicine may not work properly')",
  "alternatives": ["easy tip 1", "easy tip 2", "easy tip 3"]
}
For alternatives, give 2-3 simple steps — like when to take medicines, what to watch out for, or when to call the doctor.`,
        },
      ],
    });
    const cost = calculateCost(HAIKU, response.usage.input_tokens, response.usage.output_tokens);
    aiCosts.push({ model: HAIKU, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cost });

    const text = (response.content[0] as { text: string }).text.trim();
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned) as { problem: string; alternatives: string[] };
  } catch {
    return { problem: '', alternatives: [] };
  }
}

async function getDosageGuidance(
  brand: string,
  composition: string,
  conditions: string[],
  age: number,
  aiCosts: AiCost[]
): Promise<string> {
  if (!claude) return 'Please ask your doctor or pharmacist how to take this medicine.';

  try {
    const response = await claude.messages.create({
      model: HAIKU,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `Write for a patient or caregiver in India with no medical background.
The patient is ${age} years old with: ${conditions.join(', ') || 'no known health conditions'}.
They are taking ${brand} (${composition}).
In one simple sentence, explain the usual way to take this medicine — how many times a day and whether to take it before or after food. Use plain everyday language.`,
        },
      ],
    });

    const cost = calculateCost(HAIKU, response.usage.input_tokens, response.usage.output_tokens);
    aiCosts.push({ model: HAIKU, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cost });

    return (response.content[0] as { text: string }).text.trim();
  } catch {
    return 'Please ask your doctor or pharmacist how to take this medicine.';
  }
}

async function getBannedExplanation(combination: string[], aiCosts: AiCost[]): Promise<string> {
  const hash = combination.slice().sort().join('+');
  if (!claude) {
    return 'These medicines are not safe to take together. Please talk to your doctor immediately for a safer option.';
  }

  try {
    const cached = await BannedExplanationModel.findOne({ combinationHash: hash });
    if (cached) {
      return cached.explanation;
    }
  } catch (e) {
    logger.warn({ err: e }, 'Failed to read BannedExplanation cache');
  }

  try {
    const response = await claude.messages.create({
      model: HAIKU,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `You are a medicine safety helper writing for patients and caregivers in India.

The combination of ${combination.join(' and ')} is banned in India because it is not safe to use together.

In 1-2 simple sentences, explain in plain everyday language WHY this combination is not allowed — what harm it could cause. Write as if you are explaining to someone who is not a doctor. Avoid all medical jargon. No bullet points, no markdown, just plain text.`,
        },
      ],
    });
    const explanation = (response.content[0] as { text: string }).text.trim();
    
    const cost = calculateCost(HAIKU, response.usage.input_tokens, response.usage.output_tokens);
    aiCosts.push({ model: HAIKU, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cost });

    try {
      await BannedExplanationModel.create({ combinationHash: hash, explanation });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to save BannedExplanation to cache');
    }

    return explanation;
  } catch (e) {
    logger.error({ err: e }, 'Failed to get banned explanation from Claude');
    return 'These medicines are not safe to take together. Please talk to your doctor immediately for a safer option.';
  }
}

export async function performCheck(
  patientId: string,
  dto: CheckRequestDTO
): Promise<CheckResponseDTO> {
  const patient = await getPatientById(patientId);
  if (!patient) {
    const err = new Error('Patient not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const conditions = patient.conditions || [];
  const age = patient.age || 30;
  const aiCosts: AiCost[] = [];

  // Resolve all provided medicines
  const resolvedMeds = await Promise.all(
    dto.medicines.map(async (name) => {
      const record = await getMedicineByBrand(name);
      return {
        brand: name,
        composition: record?.composition || name,
        salts: record ? parseSalts(record.composition || '') : [name],
        safety_advice: record?.safety_advice
      };
    })
  );

  const results: CheckResultItem[] = [];

  const allSalts = resolvedMeds.flatMap(m => m.salts);
  const combinedBannedMatches = checkBanned(allSalts);

  const bannedExplanations = new Map<string, string>();
  for (const match of combinedBannedMatches) {
    const explanation = await getBannedExplanation(match.combination, aiCosts);
    bannedExplanations.set(match.combination.join('+'), explanation);
  }

  for (let i = 0; i < resolvedMeds.length; i++) {
    const medA = resolvedMeds[i];
    
    // LAYER 1: Banned check
    const medBannedMatches = combinedBannedMatches.filter(match => 
      match.combination.some(s => medA.salts.map(x => x.toLowerCase()).includes(s.toLowerCase()))
    );

    if (medBannedMatches.length > 0) {
      const match = medBannedMatches[0];
      const dosage = await getDosageGuidance(medA.brand, medA.composition, conditions, age, aiCosts);
      const explanation = bannedExplanations.get(match.combination.join('+')) || '';
      results.push({
        medicine: medA.brand,
        status: 'banned',
        severity: 'severe',
        reason: `This combination (${match.combination.join(' + ')}) is banned by the Ministry of Health. ${explanation}`,
        problem: explanation,
        alternatives: ['Do not take these medicines together', 'Consult your doctor for a safer alternative formulation', 'Report this combination to your pharmacist immediately'],
        conflictsWith: null,
        gazette_ref: match.gazette_ref,
        dosageGuidance: dosage,
        source: 'india_gazette',
      });
      continue;
    }

    let worstSeverity: 'none' | 'mild' | 'moderate' | 'severe' = 'none';
    let worstConflict: string | null = null;
    let worstReason = '';
    let worstProblem = '';
    let worstAlternatives: string[] = [];
    let worstSource: CheckResultItem['source'] = 'claude';

    // Check against all other provided medicines — j starts at i+1 to avoid duplicate pairs
    for (let j = i + 1; j < resolvedMeds.length; j++) {
      const medB = resolvedMeds[j];

      for (const saltA of medA.salts) {
        for (const saltB of medB.salts) {
          // ── LAYER 2: OpenFDA ─────────────────────────────────────────────
          const fdaText = await checkOpenFDA(saltA, saltB);
          if (fdaText) {
            if (worstSeverity === 'none') {
               worstSeverity = 'mild';
               worstConflict = medB.brand;
               worstReason = 'Interaction flagged by the FDA drug label database.';
               worstSource = 'openFDA';
               const alts = await getInteractionAlternatives(saltA, saltB, medA.brand, medB.brand, aiCosts);
               worstProblem = alts.problem;
               worstAlternatives = alts.alternatives;
            }
            continue; // OpenFDA found — skip RxNav + Claude for this salt pair
          }

          // ── LAYER 2.5: RxNav ──────────────────────────────────────────────
          const rxNavResult = await checkRxNavBySalts(saltA, saltB);
          if (rxNavResult?.found) {
            const rxSevMap: Record<string, 'mild' | 'moderate' | 'severe'> = {
              low: 'mild', moderate: 'moderate', high: 'severe',
            };
            const rxSeverity = rxSevMap[rxNavResult.severity] ?? 'mild';
            const severityRank = { none: 0, mild: 1, moderate: 2, severe: 3 };
            if (severityRank[rxSeverity] > severityRank[worstSeverity]) {
              worstSeverity = rxSeverity;
              worstConflict = medB.brand;
              worstReason = rxNavResult.description || 'Interaction documented in NLM RxNav database.';
              worstSource = 'rxnav';
              // Get actionable alternatives from Claude (we still use it for guidance, not detection)
              const alts = await getInteractionAlternatives(saltA, saltB, medA.brand, medB.brand, aiCosts);
              worstProblem = alts.problem;
              worstAlternatives = alts.alternatives;
            }
            continue; // RxNav found — skip Claude for this salt pair
          }

          // ── LAYER 3: Claude (last resort) ────────────────────────────────
          const claudeResult = await checkInteractionClaude(saltA, saltB, conditions, aiCosts);
          if (claudeResult.interacts) {
            const severityRank = { none: 0, mild: 1, moderate: 2, severe: 3 };
            if (severityRank[claudeResult.severity] > severityRank[worstSeverity]) {
              worstSeverity = claudeResult.severity;
              worstConflict = medB.brand;
              worstReason = claudeResult.reason;
              worstProblem = claudeResult.problem || '';
              worstAlternatives = claudeResult.alternatives || [];
              worstSource = 'claude';
            }
          }
        }
      }

      // ── Organ burden check (uses scraped safety_advice data) ──────────────
      const safetyA = isSafetyAdviceRecord(medA.safety_advice) ? medA.safety_advice : undefined;
      const safetyB = isSafetyAdviceRecord(medB.safety_advice) ? medB.safety_advice : undefined;
      if (safetyA && safetyB) {
         if (safetyA['Liver'] === 'UNSAFE' && safetyB['Liver'] === 'UNSAFE' && worstSeverity === 'none') {
            worstSeverity = 'moderate';
            worstConflict = medB.brand;
            worstReason = 'Both medicines can be hard on the liver when taken together.';
            worstProblem = 'When two medicines that affect the liver are taken together, it puts extra strain on the liver. Over time this may cause the liver to not work well, which can show up as yellowing of skin, tiredness, or stomach pain.';
            worstAlternatives = ['Get a liver test (LFT) done regularly as your doctor suggests', 'Do not drink alcohol while on both medicines', 'Tell your doctor right away if you notice yellowing of the skin or eyes, dark urine, or unusual tiredness'];
            worstSource = 'organ_burden';
         }
         if (safetyA['Kidney'] === 'UNSAFE' && safetyB['Kidney'] === 'UNSAFE' && worstSeverity === 'none') {
            worstSeverity = 'moderate';
            worstConflict = medB.brand;
            worstReason = 'Both medicines can put extra pressure on the kidneys when used together.';
            worstProblem = 'Taking these two medicines together may make it harder for the kidneys to work properly. This is especially risky if you are elderly, not drinking enough water, or already have kidney problems.';
            worstAlternatives = ['Drink plenty of water throughout the day — at least 8 glasses', 'Tell your doctor if you notice swelling in the feet, less urine, or feeling very tired', 'Ask your doctor if one of these medicines can be replaced with a safer option'];
            worstSource = 'organ_burden';
         }
      }

      // Record the worst finding for this pair — push once, pair contains both names
      if (worstSeverity !== 'none') {
        const dosageA = await getDosageGuidance(medA.brand, medA.composition, conditions, age, aiCosts);
        results.push({
          medicine: medA.brand,
          status: worstSeverity === 'severe' ? 'interaction' : 'warning',
          severity: worstSeverity,
          reason: worstReason,
          problem: worstProblem,
          alternatives: worstAlternatives,
          conflictsWith: medB.brand,
          gazette_ref: null,
          dosageGuidance: dosageA,
          source: worstSource,
        });
      }
    }
  }

  const safe = !results.some(r => r.status === 'banned' || r.severity === 'severe');
  const bannedCount = results.filter(r => r.status === 'banned').length;
  const interactionCount = results.filter(r => r.status === 'interaction' || r.status === 'warning').length;
  
  let summary = '';
  if (bannedCount > 0) {
    summary = `${bannedCount} medicine(s) are banned by the Ministry of Health.`;
  } else if (interactionCount > 0) {
    summary = `${interactionCount} potential interaction(s) found. Please consult your doctor.`;
  } else {
    summary = 'All medicines appear safe to take together.';
  }

  try {
    await CheckHistoryModel.create({
      patientId,
      newMedicines: resolvedMeds.map(m => ({
        brand: m.brand,
        composition: m.composition,
        salts: m.salts,
      })),
      existingMedicines: [],
      results,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to save check history');
  }

  return { safe, summary, results, aiCosts };
}
