// Voice commands through Tezaz (docs/DECISIONS.md ADR-027): apps/api's
// /voice routes say whether this user is a tester and mint the short-lived
// session tokens; the Tezaz secret key never reaches the browser.

import { api } from './api-client';

export type VoiceStatus = { enabled: false } | { enabled: true; sessionUrl: string };

export function getVoiceStatus(): Promise<VoiceStatus> {
  return api.get('/voice');
}

/** A fresh token for each connection; they live two minutes. */
export async function getVoiceToken(): Promise<string> {
  const { token } = await api.post<{ token: string; expiresAt: number }>('/voice/token');
  return token;
}
