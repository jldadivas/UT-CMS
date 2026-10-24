import { useSyncExternalStore } from 'react';

export type Reading = { timestamp: string; tof_distance_mm?: number; light_lux?: number; soil_moisture_percent?: number };
export type Settings = { baseUrl: string; port: string; interval: number; tofMin: number; tofMax: number; lightLow: number; lightHigh: number; soilDry: number; soilWet: number; soilTargetMin: number; soilTargetMax: number };
type SensorState = { settings: Settings; reading: Reading | null; records: Reading[]; loading: boolean; error: string; connected: boolean; updatedAt: string };
const defaults: Settings = { baseUrl: '', port: '8080', interval: 10, tofMin: 20, tofMax: 2000, lightLow: 100, lightHigh: 1000, soilDry: 30, soilWet: 70, soilTargetMin: 40, soilTargetMax: 65 };
let settings = { ...defaults };
let reading: Reading | null = null;
let records: Reading[] = [];
let loading = false;
let error = '';
let connected = false;
let updatedAt = '';
let listeners: (() => void)[] = [];
let currentSnapshot: SensorState = { settings, reading, records, loading, error, connected, updatedAt };
const emit = () => { currentSnapshot = { settings, reading, records, loading, error, connected, updatedAt }; listeners.forEach((listener) => listener()); };
export const subscribe = (listener: () => void) => { listeners.push(listener); return () => { listeners = listeners.filter((item) => item !== listener); }; };
export const snapshot = (): SensorState => currentSnapshot;
export function useSensors() { return useSyncExternalStore(subscribe, snapshot, snapshot); }
export function updateSettings(next: Partial<Settings>) { settings = { ...settings, ...next }; emit(); }
export async function fetchCurrent() {
  if (!settings.baseUrl.trim()) { error = 'Add your Raspberry Pi server address in Settings to connect.'; connected = false; emit(); return; }
  loading = true; error = ''; emit();
  const base = `${settings.baseUrl.trim().replace(/\/$/, '').replace(/:\d+$/, '')}:${settings.port || '8080'}`;
  try {
    const response = await fetch(`${base}/api/readings/current`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const payload = await response.json();
    const candidate = payload.reading ?? payload;
    if (typeof candidate.timestamp !== 'string' || !Number.isFinite(Date.parse(candidate.timestamp))) throw new Error('The server response is missing a valid timestamp.');
    const normalized: Reading = { timestamp: candidate.timestamp };
    for (const key of ['tof_distance_mm', 'light_lux', 'soil_moisture_percent'] as const) {
      const value = candidate[key]; if (typeof value === 'number' && Number.isFinite(value) && value >= 0) normalized[key] = value;
    }
    if (!Object.keys(normalized).some((key) => key !== 'timestamp')) throw new Error('The server response contains no valid sensor readings.');
    reading = normalized; connected = true; updatedAt = normalized.timestamp; records = [normalized, ...records.filter((item) => item.timestamp !== normalized.timestamp)].slice(0, 500);
  } catch (cause) { connected = false; error = cause instanceof Error ? cause.message : 'Could not reach the sensor server.'; }
  finally { loading = false; emit(); }
}
export async function testConnection() {
  const original = error; await fetchCurrent();
  if (!connected && !error) error = original || 'Connection failed.';
  emit(); return connected;
}
export function loadHistory() {
  const baseUrl = settings.baseUrl.trim(); if (!baseUrl) return;
  const base = `${baseUrl.replace(/\/$/, '').replace(/:\d+$/, '')}:${settings.port || '8080'}`;
  fetch(`${base}/api/readings?limit=500`).then((response) => { if (!response.ok) throw new Error('History unavailable'); return response.json(); })
    .then((payload) => { const data: unknown = Array.isArray(payload) ? payload : payload.readings; if (Array.isArray(data)) { records = data.filter((item): item is Reading => !!item && typeof item === 'object' && typeof (item as Reading).timestamp === 'string'); emit(); } }).catch(() => {});
}
