import { Tabs, TabList, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/components/sensor-ui';

const items = [['index', 'Overview'], ['analytics', 'Analytics'], ['history', 'History'], ['settings', 'Settings']];
export default function AppTabs() {
  return <Tabs><TabSlot style={{ flex: 1 }} /><TabList style={styles.bar}><View style={styles.inner}>{items.map(([name, label]) => <TabTrigger key={name} name={name} href={name === 'index' ? '/' : name === 'analytics' ? '/analytics' : name === 'history' ? '/history' : '/settings'} asChild><TabButton>{label}</TabButton></TabTrigger>)}</View></TabList></Tabs>;
}
function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) { return <Pressable {...(props as any)} style={[styles.button, isFocused && styles.active]}><Text style={{ color: isFocused ? C.green : C.muted, fontSize: 13, fontWeight: '700' }}>{children}</Text></Pressable>; }
const styles = StyleSheet.create({ bar: { padding: 12, alignItems: 'center', backgroundColor: C.bg, borderTopWidth: 1, borderColor: C.line }, inner: { width: '100%', maxWidth: 620, flexDirection: 'row', backgroundColor: '#fff', padding: 5, borderRadius: 14, gap: 3 }, button: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 }, active: { backgroundColor: '#E5F1E8' } });
