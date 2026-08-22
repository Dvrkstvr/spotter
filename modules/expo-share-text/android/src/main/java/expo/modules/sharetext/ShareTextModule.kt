package expo.modules.sharetext

import android.content.Intent
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The text of a message shared into Spotter.
 *
 * This module exists for one reason: a share arrives as `ACTION_SEND` with its
 * payload in `Intent.EXTRA_TEXT`, and **nothing in React Native or expo-linking
 * reads intent extras** — both take only `intent.getData()`, which is null for
 * a share. So the coach's reply could be tapped as a file but not shared as a
 * message, and the message is what a chat AI actually produces.
 *
 * Deliberately as small as it can be. It knows nothing about plans, backups or
 * the store: it hands JS a string, and `<Intake>` decides what the string is —
 * the same seam a tapped file goes through, and the same `parsePlan` at the end
 * of it.
 *
 * Everything is static because the intent can arrive before the module does. A
 * cold-start share reaches `onCreate` while the bundle is still loading, so the
 * text waits in `pending` until JS asks for it; a share into a running app has
 * a module to notify, which is what the observers are for.
 */
class ShareTextModule : Module() {
  private val observer: (String) -> Unit = { text ->
    sendEvent(EVENT, bundleOf("text" to text))
  }

  override fun definition() = ModuleDefinition {
    Name("ShareText")
    Events(EVENT)

    OnCreate { observers.add(observer) }
    OnDestroy { observers.remove(observer) }

    /**
     * The waiting text, taken once. Emptying the slot on read is what stops a
     * share being imported twice when JS remounts.
     */
    Function("takeSharedText") {
      val text = pending
      pending = null
      text
    }
  }

  companion object {
    const val EVENT = "onSharedText"

    private var pending: String? = null
    private val observers = mutableListOf<(String) -> Unit>()

    /**
     * Take the text off an incoming intent, if it is a text share at all.
     *
     * The extra is *removed* on the way out, and that matters: an activity keeps
     * the intent that launched it, so a share left in place would be handed over
     * again on every configuration change and every return to the app — which
     * for an import means the same plan offered forever.
     */
    fun offer(intent: Intent?) {
      if (intent == null || intent.action != Intent.ACTION_SEND) return
      if (intent.type?.startsWith("text/") != true) return
      val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
      intent.removeExtra(Intent.EXTRA_TEXT)
      // A copy, because an observer removing itself mid-notify would otherwise
      // mutate the list being walked.
      val live = observers.toList()
      if (live.isEmpty()) {
        // Cold start: no module to notify yet, so the text waits in `pending`
        // until JS asks for it via `takeSharedText`.
        pending = text
      } else {
        // A running app has a module to notify, and the event *is* the delivery
        // — so nothing is left in `pending` to be re-offered when the React root
        // next remounts. Cleared here for the same reason the take path clears
        // it, or a warm-start share imports twice.
        pending = null
        live.forEach { it(text) }
      }
    }
  }
}
