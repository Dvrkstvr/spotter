// Imported by subpath, not from the package root: the root re-exports all 18
// weights and italics, and Metro then bundles ~6 MB of fonts for the two the
// design actually uses.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as NavigationBar from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { ReactNode, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Overlays } from '@/components/overlays';
import { ThemeProvider, themed, useColors, useDark, useThemed } from '@/design/theme';
import { color } from '@/design/tokens';
import { useStore, WorkoutProvider } from '@/store/workout-store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium });

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <WorkoutProvider>
        <AppTheme>
          <Shell />
        </AppTheme>
      </WorkoutProvider>
    </SafeAreaProvider>
  );
}

/**
 * Feeds the stored theme into the design layer. The store owns which palette
 * is on, so this sits inside it — and everything that paints sits inside the
 * theme provider, or it renders holding the palette from before the swap.
 *
 * `<Shell />` is passed down as `children` from a component that does *not*
 * read the store, and that placement is load-bearing: reading the store means
 * re-rendering on every keystroke in a weight field, and a stable `children`
 * element is what keeps that off the navigator.
 */
function AppTheme({ children }: { children: ReactNode }) {
  const { s, hydrated } = useStore();

  // Held on the stored theme, not just the fonts: hiding the splash a beat
  // earlier is a dark flash on every launch for anyone running light.
  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  return (
    <ThemeProvider mode={s.themeMode} name={s.theme}>
      {children}
    </ThemeProvider>
  );
}

/**
 * Overlays are siblings of the navigator, not screens in it — that is what lets
 * a sheet or a live session sit over the tab bar the way the design draws them.
 *
 * The root view is gesture-handler's, and it has to be: on Android nothing
 * below it gets a gesture without it. The one thing that needs it is the
 * hold-and-drag on a set's numbers, which sits on top of a TextInput — see
 * `NumCell` in the session overlay for why a PanResponder can't do that job.
 */
function Shell() {
  const styles = useThemed(sheet);
  const c = useColors();
  const dark = useDark();
  // Read during render, so the effect below re-fires on a palette swap.
  const bg = c.bg;

  // Two surfaces the React tree doesn't own, both of which default to a black
  // that reads as a hole under a light theme: the window behind the root
  // (visible under a keyboard and during rotation) and Android's navigation
  // bar. Which navigation-bar call lands depends on whether edge-to-edge is
  // on — the colour is a no-op when it is, the button style works either way —
  // so both are made and both are allowed to fail.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(bg).catch(() => {});
    NavigationBar.setBackgroundColorAsync(bg).catch(() => {});
    NavigationBar.setButtonStyleAsync(dark ? 'light' : 'dark').catch(() => {});
  }, [bg, dark]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
      <Overlays />
    </GestureHandlerRootView>
  );
}

const sheet = themed(() => ({
  root: { flex: 1, backgroundColor: color.bg },
}));
