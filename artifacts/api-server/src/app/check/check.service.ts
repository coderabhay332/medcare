import { parseSalts } from '../common/helper/saltParser.js';
import { checkBanned } from '../common/helper/bannedChecker.js';
import { claude, HAIKU } from '../common/services/claudeClient.js';
import { getPatientById } from '../patient/patient.service.js';
import { CheckHistoryModel } from './check.schema.js';
import { getMedicineByBrand } from '../common/services/medicineIndex.js';
import type { CheckRequestDTO, CheckResponseDTO, CheckResultItem } from './check.dto.js';
import { logger } from '../../lib/logger.js';

interface InteractionResult {
  interacts: boolean;
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  reason: string;
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
  conditions: string[]
): Promise<InteractionResult> {
  try {
    const response = await claude.messages.create({
      model: HAIKU,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Do ${saltA} and ${saltB} interact? Patient conditions: ${conditions.join(', ') || 'none'}.
Reply ONLY as JSON: { "interacts": boolean, "severity": "none"|"mild"|"moderate"|"severe", "reason": "string (max 2 sentences)" }`,
        },
      ],
    });

    const text = (response.content[0] as { text: string }).text;
    return JSON.parse(text) as InteractionResult;
  } catch {
    return { interacts: false, severity: 'none', reason: '' };
  }
}

async function getDosageGuidance(
  brand: string,
  composition: string,
  conditions: string[],
  age: number
): Promise<string> {
  try {
    const response = await claude.messages.create({
      model: HAIKU,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `Patient has ${conditions.join(', ') || 'no known conditions'} and is ${age} years old.
They are starting ${brand} (${composition}).
What is the standard adult dosage? One sentence. Include frequency and meal timing.`,
        },
      ],
    });
    return (response.content[0] as { text: string }).text.trim();
  } catch {
    return 'Consult your doctor for appropriate dosage.';
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

  const activeMeds = patient.currentMedications.filter(m => m.active);
  const results: CheckResultItem[] = [];

  for (const newMed of dto.newMedicines) {
    const newSalts = parseSalts(newMed.composition);

    const resultItem: CheckResultItem = {
      medicine: newMed.brand,
      status: 'safe',
      severity: 'none',
      reason: 'No issues found.',
      conflictsWith: null,
      gazette_ref: null,
      dosageGuidance: '',
      source: 'india_gazette',
    };

    // LAYER 1: Banned check
    const bannedMatches = checkBanned(newSalts);
    if (bannedMatches.length > 0) {
      const match = bannedMatches[0];
      resultItem.status = 'banned';
      resultItem.severity = 'severe';
      resultItem.reason = `This fixed-dose combination is banned by the Ministry of Health and Family Welfare.`;
      resultItem.gazette_ref = match.gazette_ref;
      resultItem.source = 'india_gazette';

      const dosage = await getDosageGuidance(
        newMed.brand,
        newMed.composition,
        patient.conditions,
        patient.age
      );
      resultItem.dosageGuidance = dosage;
      results.push(resultItem);
      continue;
    }

    // LAYER 2: Interaction check vs current medications
    let worstSeverity: 'none' | 'mild' | 'moderate' | 'severe' = 'none';
    let worstConflict: string | null = null;
    let worstReason = '';
    let worstSource: CheckResultItem['source'] = 'claude';

    for (const currentMed of activeMeds) {
      for (const newSalt of newSalts) {
        for (const currentSalt of currentMed.salts) {
          // Try OpenFDA first
          const fdaText = await checkOpenFDA(newSalt, currentSalt);
          if (fdaText) {
            if (worstSeverity === 'none') {
              worstSeverity = 'mild';
              worstConflict = currentMed.brand;
              worstReason = `Interaction found in FDA database with ${currentMed.brand}.`;
              worstSource = 'openFDA';
            }
            continue;
          }

          // Fallback to Claude
          const claudeResult = await checkInteractionClaude(
            newSalt,
            currentSalt,
            patient.conditions
          );

          if (claudeResult.interacts) {
            const severityRank = { none: 0, mild: 1, moderate: 2, severe: 3 };
            if (severityRank[claudeResult.severity] > severityRank[worstSeverity]) {
              worstSeverity = claudeResult.severity;
              worstConflict = currentMed.brand;
              worstReason = claudeResult.reason;
              worstSource = 'claude';
            }
          }
        }
      }
    }

    if (worstSeverity !== 'none') {
      resultItem.status = worstSeverity === 'severe' ? 'interaction' : 'warning';
      resultItem.severity = worstSeverity;
      resultItem.reason = worstReason;
      resultItem.conflictsWith = worstConflict;
      resultItem.source = worstSource;
    }

    // LAYER 3: Safety advice conflicts (Liver + Kidney)
    const newMedRecord = getMedicineByBrand(newMed.brand);
    if (newMedRecord?.safety_advice) {
      for (const currentMed of activeMeds) {
        const currentRecord = getMedicineByBrand(currentMed.brand);
        if (!currentRecord?.safety_advice) continue;

        if (
          newMedRecord.safety_advice.Liver === 'UNSAFE' &&
          currentRecord.safety_advice.Liver === 'UNSAFE' &&
          resultItem.severity === 'none'
        ) {
          resultItem.status = 'warning';
          resultItem.severity = 'moderate';
          resultItem.reason = 'Combined liver burden — both medicines are unsafe for the liver.';
          resultItem.conflictsWith = currentMed.brand;
          resultItem.source = 'claude';
        }

        if (
          newMedRecord.safety_advice.Kidney === 'UNSAFE' &&
          currentRecord.safety_advice.Kidney === 'UNSAFE' &&
          resultItem.severity === 'none'
        ) {
          resultItem.status = 'warning';
          resultItem.severity = 'moderate';
          resultItem.reason = 'Combined kidney burden — both medicines are unsafe for the kidneys.';
          resultItem.conflictsWith = currentMed.brand;
          resultItem.source = 'claude';
        }
      }
    }

    // LAYER 4: Dosage guidance
    const dosage = await getDosageGuidance(
      newMed.brand,
      newMed.composition,
      patient.conditions,
      patient.age
    );
    resultItem.dosageGuidance = dosage;

    results.push(resultItem);
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
    summary = 'All medicines appear safe with your current medications.';
  }

  // Save to CheckHistory
  try {
    await CheckHistoryModel.create({
      patientId,
      newMedicines: dto.newMedicines.map(m => ({
        brand: m.brand,
        composition: m.composition,
        salts: parseSalts(m.composition),
      })),
      existingMedicines: activeMeds.map(m => ({
        brand: m.brand,
        composition: m.composition,
        salts: m.salts,
      })),
      results,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to save check history');
  }

  return { safe, summary, results };
}
