import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, C, Header, Page, Panel, SensorCard, s } from '@/components/sensor-ui';
import { fetchCurrent, useSensors } from '@/lib/sensors';

export default function Dashboard() {
  const { reading, records, connected, loading, error, updatedAt, settings } = useSensors();
  useEffect(() => { fetchCurrent(); const timer = setInterval(fetchCurrent, Math.max(5, settings.interval) * 1000); return () => clearInterval(timer); }, [settings.baseUrl, settings.port, settings.interval]);
  const d = reading?.tof_distance_mm, l = reading?.light_lux, m = reading?.soil_moisture_percent;
  const isStale = !!updatedAt && Date.now() - Date.parse(updatedAt) > Math.max(15, settings.interval * 3) * 1000;
  const tofStatus = d == null ? 'No reading' : d < settings.tofMin || d > settings.tofMax ? 'Out of range' : 'Normal';
  const lightStatus = l == null ? 'No reading' : l < settings.lightLow ? 'Dark' : l > settings.lightHigh ? 'Bright' : 'Normal';
  const soilStatus = m == null ? 'No reading' : m < settings.soilDry ? 'Dry' : m > settings.soilWet ? 'Wet' : 'Normal';
  return <Page><Header eyebrow="IoT sensor monitoring system" title="Dashboard" detail="Live conditions from your sensor network." /><View style={{ alignItems: 'flex-start', marginTop: -10, marginBottom: 14 }}><Button label={loading ? 'Refreshing…' : '↻ Refresh readings'} onPress={fetchCurrent} disabled={loading} /></View>
    <Panel style={{ marginBottom: 16, backgroundColor: connected && !isStale ? '#EAF4ED' : C.card }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ fontWeight: '700', color: C.ink }}>Raspberry Pi connection</Text><Text style={{ color: connected && !isStale ? C.green : C.orange, fontSize: 12, fontWeight: '800' }}>● {connected ? isStale ? 'STALE DATA' : 'CONNECTED' : 'DISCONNECTED'}</Text></View><Text style={[s.muted, { marginTop: 7 }]}>{updatedAt ? `Last update · ${new Date(updatedAt).toLocaleString()}` : 'Waiting for a valid server reading'}</Text>{isStale ? <Text style={{ color: C.orange, fontSize: 12, marginTop: 5 }}>The latest timestamp is older than three refresh intervals.</Text> : null}</Panel>
    {loading && !reading && <ActivityIndicator color={C.green} style={{ marginVertical: 12 }} />}{error ? <Panel style={{ marginBottom: 14, borderColor: '#E9C8C1' }}><Text style={{ color: C.red, fontWeight: '700', marginBottom: 4 }}>Unable to retrieve sensor data</Text><Text style={s.muted}>{error}</Text></Panel> : null}
    <SensorCard type="TOF distance" value={d} unit="mm" status={tofStatus} note={d == null ? 'No valid measurement received' : `Allowed range ${settings.tofMin}–${settings.tofMax} mm`} color={tofStatus === 'Out of range' ? C.orange : C.green} />
    <SensorCard type="Light intensity" value={l} unit="lx" status={lightStatus} note={l == null ? 'Lux is shown only when the API provides calibrated lux' : `Low ${settings.lightLow} lx · high ${settings.lightHigh} lx`} color={lightStatus === 'Dark' || lightStatus === 'Bright' ? C.orange : C.blue} />
    <SensorCard type="Soil moisture" value={m} unit="%" status={soilStatus} note={m == null ? 'No valid measurement received' : `Desired range ${settings.soilTargetMin}–${settings.soilTargetMax}%`} color={soilStatus === 'Dry' || soilStatus === 'Wet' ? C.orange : C.green} progress={m} />
    <Text style={[s.muted, { textAlign: 'center', marginTop: 4 }]}>{records.length ? `${records.length} readings available in this session` : 'Historical readings will appear when provided by your API.'}</Text>
  </Page>;
}
