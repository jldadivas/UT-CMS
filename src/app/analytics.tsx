import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, C, Header, Page, Panel, Trend, s } from '@/components/sensor-ui';
import { loadHistory, Reading, useSensors } from '@/lib/sensors';

const filters = [{ label: '15 min', ms: 900_000 }, { label: '1 hour', ms: 3_600_000 }, { label: '24 hours', ms: 86_400_000 }, { label: '7 days', ms: 604_800_000 }];
function Series({ title, unit, field, color, data }: { title: string; unit: string; field: keyof Reading; color: string; data: Reading[] }) {
  const values = data.map((item) => item[field]).filter((value): value is number => typeof value === 'number');
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return <Panel style={{ marginBottom: 14 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.sensorName}>{title}</Text><Text style={{ color, fontWeight: '700', fontSize: 12 }}>● {unit}</Text></View>{values.length ? <><Trend data={data} field={field} color={color} unit={unit} /><View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: C.line, paddingTop: 12, marginTop: 10 }}><Stat label="MIN" value={Math.min(...values)} unit={unit} /><Stat label="MAX" value={Math.max(...values)} unit={unit} /><Stat label="AVG" value={avg!} unit={unit} /></View><Text style={[s.muted, { marginTop: 9 }]}>Horizontal axis: oldest → newest · {values.length} measurements</Text></> : <Text style={[s.muted, { marginTop: 25, marginBottom: 20 }]}>No historical data for this period. Connect an API that stores timestamped readings.</Text>}</Panel>;
}
function Stat({ label, value, unit }: { label: string; value: number; unit: string }) { return <View><Text style={[s.eyebrow, { fontSize: 9 }]}>{label}</Text><Text style={{ fontSize: 16, color: C.ink, fontWeight: '700' }}>{value.toFixed(1)} <Text style={{ fontSize: 11, color: C.muted }}>{unit}</Text></Text></View>; }
export default function Analytics() {
  const { records, settings } = useSensors(); const [range, setRange] = useState(filters[2]);
  useEffect(() => { loadHistory(); }, [settings.baseUrl, settings.port]);
  const data = useMemo(() => records.filter((item) => { const time = Date.parse(item.timestamp); return Number.isFinite(time) && Date.now() - time <= range.ms; }).sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp)), [records, range]);
  return <Page><Header eyebrow="Insights" title="Analytics" detail="Sensor trends and summary statistics." /><View style={{ flexDirection: 'row', gap: 7, marginBottom: 16 }}>{filters.map((item) => <View key={item.label} style={{ flex: 1 }}><Button label={item.label} onPress={() => setRange(item)} secondary={range.label !== item.label} /></View>)}</View><Series title="TOF distance" unit="mm" field="tof_distance_mm" color={C.green} data={data} /><Series title="Light intensity" unit="lx" field="light_lux" color={C.blue} data={data} /><Series title="Soil moisture" unit="%" field="soil_moisture_percent" color={C.orange} data={data} /></Page>;
}
