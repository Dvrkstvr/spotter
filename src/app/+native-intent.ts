/**
 * Everything the OS hands this app as a URL, before the router sees it.
 *
 * expo-router calls this with the raw intent data — on a cold start it becomes
 * the app's initial URL, and on a warm one it is what `Linking` would have
 * navigated to. Which makes it the only seam where a `content://` URI can be
 * caught: it is not a route, and letting it through would send the router
 * hunting for a screen called `com.whatsapp.provider.media`.
 *
 * So a file URI is lifted out and the router is answered with the tab it should
 * have opened anyway. `<Intake>` picks the URI up from there and decides what
 * the file is — which is the whole reason this file holds no knowledge of
 * backups, plans or the store: it runs while the bundle is still starting, and
 * on a cold start there is no component tree yet to hand anything to.
 *
 * Only Android reaches this in practice. `file://` is here for the same reason
 * `pickAndRead` is unfiltered — a file that has been through a cloud drive or a
 * file manager arrives however that app felt like handing it over.
 */
import { offerFile } from '@/data/intake';

/** Schemes that mean "a file", as opposed to a route or a deep link. */
const FILE_URI = /^(content|file):/i;

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (!FILE_URI.test(path)) return path;
  // Throwing in here can take the launch down with it, and a file that failed
  // to register is a file the user taps again — landing on Today is the honest
  // outcome either way.
  try {
    offerFile(path);
  } catch {}
  return '/';
}
