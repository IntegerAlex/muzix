import { api, type AuthResponse } from '@/services/api';

export async function register(email: string, password: string, displayName?: string): Promise<AuthResponse> {
  return api.register(email, password, displayName);
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return api.login(email, password);
}
