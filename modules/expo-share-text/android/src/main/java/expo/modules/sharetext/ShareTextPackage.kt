package expo.modules.sharetext

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Both moments a share can arrive, which is why this exists at all.
 *
 * `onCreate` is the cold start — the activity's own intent *is* the share. The
 * warm one has to be `onNewIntent`, because React Native's `onNewIntent` never
 * calls `setIntent`, so `activity.intent` still holds whatever launched the app
 * the first time. Reading the activity's intent on demand would therefore work
 * once and then quietly hand over a stale share forever.
 *
 * `onNewIntent` returns false: this only watches, and swallowing the intent
 * would take it from expo-linking, which is looking at the same one for a URL.
 */
class ShareTextActivityLifecycleListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    ShareTextModule.offer(activity?.intent)
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    ShareTextModule.offer(intent)
    return false
  }
}

class ShareTextPackage : Package {
  override fun createReactActivityLifecycleListeners(
    activityContext: android.content.Context?
  ): List<ReactActivityLifecycleListener> = listOf(ShareTextActivityLifecycleListener())
}
