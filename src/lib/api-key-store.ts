"use client";

import { useSyncExternalStore } from "react";

// Local-only API key store (bring-your-own-key for live chat).
// Implemented as an external store so components can read localStorage
// without setState-in-effect and without hydration mismatches.

const KEY = "dayflow.apiKey";
const listeners = new Set<() => void>();

function getSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function getServerSnapshot(): string {
  return "";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  try {
    window.addEventListener("storage", listener);
  } catch {
    /* ignore */
  }
  return () => {
    listeners.delete(listener);
    try {
      window.removeEventListener("storage", listener);
    } catch {
      /* ignore */
    }
  };
}

export function getApiKey(): string {
  return getSnapshot();
}

export function saveApiKey(value: string): void {
  try {
    localStorage.setItem(KEY, value.trim());
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** Reactive read of the stored key ("" on the server). */
export function useApiKey(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
