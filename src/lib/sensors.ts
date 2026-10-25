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

function getApiBaseUrl(): string {
  const address = settings.baseUrl.trim();
  if (!address) throw new Error('Enter your Raspberry Pi IP address in Settings.');
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(address) ? address : `http://${address}`;
  const match = /^(https?):\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(withScheme);
  if (!match) throw new Error('Invalid server address. Enter the Pi IP, for example 192.168.1.50.');
  const protocol = match[1].toLowerCase();
  const authority = match[2];
  const hostname = authority.startsWith('[')
    ? authority.replace(/\]:\d+$/, ']')
    : authority.replace(/:\d+$/, '');
  if (!hostname || /\s|@/.test(hostname) || (!hostname.startsWith('[') && hostname.includes(':')) || (hostname.startsWith('[') && !hostname.endsWith(']'))) {
    throw new Error('Invalid server address. Enter the Pi IP, for example 192.168.1.50.');
  }
  const port = settings.port.trim() || '8080';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('API port must be a number from 1 to 65535.');
  return `${protocol}://${hostname}:${port}`;
}

export async function fetchCurrent() {
  if (!settings.baseUrl.trim()) { error = 'Add your Raspberry Pi server address in Settings to connect.'; connected = false; emit(); return; }
  loading = true; error = ''; emit();
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/readings/current`, { signal: AbortSignal.timeout(8000) });
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
  fetch(`${getApiBaseUrl()}/api/readings?limit=500`).then((response) => { if (!response.ok) throw new Error('History unavailable'); return response.json(); })
    .then((payload) => { const data: unknown = Array.isArray(payload) ? payload : payload.readings; if (Array.isArray(data)) { records = data.filter((item): item is Reading => !!item && typeof item === 'object' && typeof (item as Reading).timestamp === 'string'); emit(); } }).catch(() => {});
}
