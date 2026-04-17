import Anthropic from '@anthropic-ai/sdk';

export const claude = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

export const HAIKU = 'claude-haiku-4-5';
export const SONNET = 'claude-sonnet-4-5';
