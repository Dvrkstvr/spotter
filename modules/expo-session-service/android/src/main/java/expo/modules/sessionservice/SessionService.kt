package expo.modules.sessionservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * The foreground service a live workout runs under.
 *
 * What it buys, in order of why it exists:
 *  - **The process survives backgrounding and the screen locking.** React
 *    Native's JS runs in the process, not the activity, so with this service
 *    holding foreground priority the session clock, the rest countdown and
 *    the whole buddy radio keep running in a pocket — including across an
 *    accidental swipe-away, which destroys the activity but not the process.
 *  - **The wakelock keeps the CPU on while a buddy link is live** (and only
 *    then — `keepAwake` is the caller's call). A suspended JS thread cannot
 *    broadcast progress, answer pings or heal a dropped link, and a locked
 *    phone between sets is the common case, not the edge. Solo sessions skip
 *    it: their clock is wall-anchored and their alarm is Android's, so the
 *    battery buys nothing.
 *  - **The notification is the way back in.** Ongoing, silent, low
 *    importance, with the system chronometer counting up from the session's
 *    own start — zero updates to keep it live — and a tap that lands in the
 *    app.
 *
 * Deliberately dumb, like every module here: it knows nothing about sessions
 * or the store. JS starts it with strings and stops it; repeated starts
 * re-post the same notification id, which is how the text and the wakelock
 * follow state changes.
 *
 * An orphan is impossible by construction: the service lives in the app's own
 * process, so a JS crash takes the service (and its notification and
 * wakelock) down with it, and `onDestroy` covers the graceful paths.
 */
class SessionService : Service() {
  private var lock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: ""
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
    val channelName = intent?.getStringExtra(EXTRA_CHANNEL) ?: "Workout"
    val startedAt = intent?.getLongExtra(EXTRA_STARTED_AT, 0L) ?: 0L
    val keepAwake = intent?.getBooleanExtra(EXTRA_KEEP_AWAKE, false) ?: false

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Re-creating the channel under the same id is how Android takes a
      // rename, so a language switch updates it — same move the rest channel
      // makes in rest-alarm.ts.
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL, channelName, NotificationManager.IMPORTANCE_LOW).apply {
          setShowBadge(false)
        }
      )
    }

    val tap = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL)
      else @Suppress("DEPRECATION") Notification.Builder(this)
    builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setContentIntent(tap)
    if (startedAt > 0L) {
      // The system draws the elapsed clock itself — the one way to show a
      // live counter without re-posting the notification every second.
      builder.setWhen(startedAt).setShowWhen(true).setUsesChronometer(true)
    }

    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(ID, builder.build())
    }

    if (keepAwake) acquire() else release()
    // A restart with a null intent would post an empty notification for a
    // session the process death already ended — the persisted session (the
    // store's LIVE keys) is what actually survives, and JS restarts this
    // service when it resumes one.
    return START_NOT_STICKY
  }

  private fun acquire() {
    if (lock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "spotter:session").apply {
      setReferenceCounted(false)
      // A ceiling, not a schedule: effectively unbounded for any real workout,
      // while guaranteeing the lock cannot outlast a session by days if a
      // release path is ever missed.
      acquire(10 * 60 * 60 * 1000L)
    }
  }

  private fun release() {
    lock?.takeIf { it.isHeld }?.release()
    lock = null
  }

  override fun onDestroy() {
    release()
  }

  companion object {
    const val ID = 41
    const val CHANNEL = "session"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_CHANNEL = "channelName"
    const val EXTRA_STARTED_AT = "startedAt"
    const val EXTRA_KEEP_AWAKE = "keepAwake"
  }
}
