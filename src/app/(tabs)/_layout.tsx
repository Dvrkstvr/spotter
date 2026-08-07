import { Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';
import { color } from '@/design/tokens';

/**
 * `plan` is registered here but has no button in the bar — it is reached from
 * Today's "See plan", and while it is open no tab reads as selected. That is
 * how the design behaves.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="routines" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}
