import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env['ANTHROPIC_API_KEY'];

/** Whether Anthropic is configured (key present and not placeholder) */
export const isAnthropicConfigured =
  Boolean(apiKey) && apiKey !== 'your-anthropic-api-key-here';

// Uses the direct Anthropic API key from environment variables:
//   ANTHROPIC_API_KEY — get yours at https://console.anthropic.com/
export const claude = isAnthropicConfigured
  ? new Anthropic({ apiKey })
  : null;

// ── Current Anthropic models ──────────────────────────────────────────────────
// claude-haiku-4-5-20251001  — widely available, cheapest
// claude-sonnet-4-6          — high quality, vision capable

/** Claude 4.5 Haiku — widely available, cheapest vision-capable fallback */
export const HAIKU = 'claude-haiku-4-5-20251001';

/** Claude 4.5 Haiku (newer) */
export const HAIKU_35 = 'claude-haiku-4-5-20251001';

/** Claude 4.6 Sonnet — vision capable, high quality */
export const SONNET_35 = 'claude-sonnet-4-6';

/**
 * Model used for medicine label scanning — FALLBACK only.
 * Primary scanner is Gemini Flash (free). Claude Haiku is the paid fallback.
 */
export const SCAN_MODEL = HAIKU;
