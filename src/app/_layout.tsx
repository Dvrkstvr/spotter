// Imported by subpath, not from the package root: the root re-exports all 18
// weights and italics, and Metro then bundles ~6 MB of fonts for the two the
// design actually uses.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Overlays } from '@/components/overlays';
import { color } from '@/design/tokens';
import { WorkoutProvider } from '@/store/workout-store';

SplashScreen.preventAutoHideAsync();

/**
 * Overlays are siblings of the navigator, not screens in it — that is what lets
 * a sheet or a live session sit over the tab bar the way the design draws them.
 */
export default function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <WorkoutProvider>
        <View style={styles.root}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}
          />
          <Overlays />
        </View>
      </WorkoutProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
