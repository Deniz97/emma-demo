"use client";

const DEVICE_KEY_STORAGE = "emma-device-key";

export function getDeviceKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEVICE_KEY_STORAGE);
}

export function setDeviceKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEVICE_KEY_STORAGE, key);
}

export function generateDeviceKey(): string {
  return `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export function getOrCreateDeviceKey(): string {
  let key = getDeviceKey();
  if (!key) {
    key = generateDeviceKey();
    setDeviceKey(key);
  }
  return key;
}

