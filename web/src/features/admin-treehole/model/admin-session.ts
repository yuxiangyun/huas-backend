export interface AdminBasicSession {
  username: string;
  authorization: string;
}

const STORAGE_KEY = 'huas-web.admin-basic-session';

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary);
}

export function createAdminBasicSession(username: string, password: string): AdminBasicSession {
  const normalizedUsername = username.trim();
  return {
    username: normalizedUsername,
    authorization: `Basic ${encodeBase64(`${normalizedUsername}:${password}`)}`,
  };
}

export function readAdminBasicSession(): AdminBasicSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AdminBasicSession>;
    if (!parsed.username || !parsed.authorization) {
      return null;
    }

    return {
      username: parsed.username,
      authorization: parsed.authorization,
    };
  } catch {
    return null;
  }
}

export function writeAdminBasicSession(session: AdminBasicSession) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearAdminBasicSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
