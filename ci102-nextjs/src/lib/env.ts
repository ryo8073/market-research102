/**
 * Server-side environment variable access.
 * Only import this in server components or API routes.
 */

export function getEnv(key: string): string {
  return process.env[key] ?? "";
}

export const hasEstatKey = () => Boolean(getEnv("ESTAT_APP_ID"));
export const hasMlitKey = () => Boolean(getEnv("MLIT_API_KEY"));
export const hasAnthropicKey = () => Boolean(getEnv("ANTHROPIC_API_KEY"));
export const hasProformerKey = () => Boolean(getEnv("PROFORMER_API_KEY"));
