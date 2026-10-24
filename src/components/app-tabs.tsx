import { NativeTabs } from 'expo-router/native-tabs';
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  return <NativeTabs backgroundColor={colors.background} indicatorColor={colors.backgroundElement} labelStyle={{ selected: { color: colors.text } }}>
    <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf="rectangle.grid.2x2" /></NativeTabs.Trigger>
    <NativeTabs.Trigger name="analytics"><NativeTabs.Trigger.Label>Analytics</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf="chart.xyaxis.line" /></NativeTabs.Trigger>
    <NativeTabs.Trigger name="history"><NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" /></NativeTabs.Trigger>
    <NativeTabs.Trigger name="settings"><NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf="slider.horizontal.3" /></NativeTabs.Trigger>
  </NativeTabs>;
}
