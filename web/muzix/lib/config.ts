function getEnv(key: string): string | undefined {
  try {
    return typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)[key] : undefined;
  } catch {
    return undefined;
  }
}

export const API_URL = getEnv('EXPO_PUBLIC_API_URL') ?? 'http://localhost:8000';

