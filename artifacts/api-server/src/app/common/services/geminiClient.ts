import { GoogleGenerativeAI } from '@google/generative-ai';

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
// gemini-flash-latest  — confirmed working (use this, it's an alias that always resolves)
// gemini-1.5-flash     — explicit version alternative
export const GEMINI_MODEL = 'gemini-flash-latest';

/** The prompt used to extract medicine names from an image */
export const SCAN_PROMPT = `This is either a doctor's prescription or medicine packaging.
Extract all medicine and drug names visible in this image.
Return ONLY a JSON array of strings — the brand/generic medicine names exactly as printed.
Example: ["Dolo 650", "Ascoril D Plus", "Metformin 500mg"]
If no medicine names are visible, return: []
No explanation. No markdown. Just the raw JSON array.`;

/**
 * Extracts medicine names from an image buffer using Gemini Flash (free tier).
 * Returns null if Gemini is not configured or if the API call fails,
 * allowing the caller to fall back to another provider.
 */
export async function extractWithGemini(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string[] | null> {
  if (!genAI) {
    console.info('[scan:gemini] GEMINI_API_KEY not set — skipping Gemini');
    return null;
  }

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent([
      SCAN_PROMPT,
      {
        inlineData: {
          mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data: imageBuffer.toString('base64'),
        },
      },
    ]);

    const rawText = result.response.text() ?? '';

    // Strip markdown code fences if Gemini wraps in ```json ... ```
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    console.log('[scan:gemini] raw response:', rawText.slice(0, 300));

    const parsed = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(parsed)) {
      console.warn('[scan:gemini] Did not return an array, got:', typeof parsed);
      return null;
    }

    return parsed as string[];
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    console.error('[scan:gemini] API call failed —', {
      name:    e?.name,
      message: e?.message,
      status:  e?.status,
    });
    return null; // signal caller to try fallback
  }
}
