package expo.modules.donotdisturb

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// "No molestar" while the individual stopwatch records (issue 1090). The mode the phone had before is kept on disk, so
// it comes back when the recording ends, when the activity is destroyed, or the next time the app starts after Android
// closed it by force.
class DoNotDisturbModule : Module() {
  private val context: Context?
    get() = appContext.reactContext

  private val manager: NotificationManager?
    get() = context?.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager

  private val saved
    get() = context?.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  private fun hasAccess(): Boolean = manager?.isNotificationPolicyAccessGranted == true

  // "Solo prioridad": the person's own "No molestar" rules decide who still gets through.
  private fun turnOn(): Boolean {
    val manager = manager ?: return false
    val store = saved ?: return false
    if (!hasAccess()) return false
    if (!store.contains(PREVIOUS)) {
      val current = manager.currentInterruptionFilter
      val previous = if (current == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) NotificationManager.INTERRUPTION_FILTER_ALL else current
      // Written before the change, so a crash right after still finds it.
      store.edit().putInt(PREVIOUS, previous).commit()
    }
    manager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
    return true
  }

  // Puts back the mode the phone had before the recording; nothing when the app did not change it.
  private fun restore() {
    val store = saved ?: return
    if (!store.contains(PREVIOUS)) return
    val previous = store.getInt(PREVIOUS, NotificationManager.INTERRUPTION_FILTER_ALL)
    if (hasAccess()) manager?.setInterruptionFilter(previous)
    store.edit().remove(PREVIOUS).commit()
  }

  override fun definition() = ModuleDefinition {
    Name("DoNotDisturb")

    // A previous run that ended without restoring (Android closed the app while recording).
    OnCreate { restore() }

    OnActivityDestroys { restore() }

    Function("hasAccess") { hasAccess() }

    Function("openAccessSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context?.startActivity(intent)
    }

    Function("turnOn") { turnOn() }

    Function("restore") { restore() }
  }

  companion object {
    private const val STORE = "trailskill-do-not-disturb"
    private const val PREVIOUS = "previous-interruption-filter"
  }
}
