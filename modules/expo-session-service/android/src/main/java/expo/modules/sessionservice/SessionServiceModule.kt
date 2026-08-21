package expo.modules.sessionservice

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JS surface over SessionService: start with the strings the notification
 * shows, stop when the session ends. Both swallow their own failures — a
 * workout must never be lost to a notification, which is the same rule the
 * rest alarm follows.
 *
 * The one failure worth naming: Android refuses a foreground-service *start*
 * from a backgrounded app. The first start is always made in the foreground
 * (starting or resuming a session is a thing done looking at the screen), and
 * an app with a running foreground service is exempt from the restriction, so
 * the re-posts that follow state changes go through — the runCatching is for
 * whatever edge remains.
 */
class SessionServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SessionService")

    Function("start") { title: String, text: String, channelName: String, startedAtMs: Double, keepAwake: Boolean ->
      val ctx = appContext.reactContext
      if (ctx != null) runCatching {
        val i = Intent(ctx, SessionService::class.java)
          .putExtra(SessionService.EXTRA_TITLE, title)
          .putExtra(SessionService.EXTRA_TEXT, text)
          .putExtra(SessionService.EXTRA_CHANNEL, channelName)
          .putExtra(SessionService.EXTRA_STARTED_AT, startedAtMs.toLong())
          .putExtra(SessionService.EXTRA_KEEP_AWAKE, keepAwake)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i)
        else ctx.startService(i)
      }
      Unit
    }

    Function("stop") {
      val ctx = appContext.reactContext
      if (ctx != null) runCatching { ctx.stopService(Intent(ctx, SessionService::class.java)) }
      Unit
    }
  }
}
