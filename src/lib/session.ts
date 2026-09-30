"use client";

export interface Session {
  playerId: string;
  token: string;
  name: string;
}

const key = (code: string) => `kd:session:${code.toUpperCase()}`;

export const loadSession = (code: string): Session | null => {
  try {
    const raw = localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
};

export const saveSession = (code: string, s: Session) => {
  try {
    localStorage.setItem(key(code), JSON.stringify(s));
    localStorage.setItem("kd:name", s.name);
  } catch {}
};

export const clearSession = (code: string) => {
  try {
    localStorage.removeItem(key(code));
  } catch {}
};

export const lastName = () => {
  try {
    return localStorage.getItem("kd:name") ?? "";
  } catch {
    return "";
  }
};
