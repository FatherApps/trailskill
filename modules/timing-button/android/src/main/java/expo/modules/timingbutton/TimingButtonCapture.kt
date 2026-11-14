package expo.modules.timingbutton

import android.os.Build
import android.os.SystemClock
import android.view.KeyEvent

/**
 * What the activity does with key presses. Shared by the activity handler (which receives the keys) and the module
 * (which JavaScript controls). Keys are touched only on the main thread; the fields are volatile because JavaScript
 * changes the mode from its own thread.
 */
internal object TimingButtonCapture {
  enum class Mode { OFF, CAPTURE, LEARN }

  @Volatile var mode: Mode = Mode.OFF
  @Volatile var keys: Set<Int> = emptySet()
  @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null

  // Never taken: leaving the app, the system and accessibility must keep working.
  private val systemKeys = setOf(
    KeyEvent.KEYCODE_BACK,
    KeyEvent.KEYCODE_HOME,
    KeyEvent.KEYCODE_POWER,
    KeyEvent.KEYCODE_APP_SWITCH,
    KeyEvent.KEYCODE_MENU,
    KeyEvent.KEYCODE_SLEEP,
    KeyEvent.KEYCODE_WAKEUP,
  )

  /** The clock of every mark: nanoseconds since boot, counting deep sleep. */
  fun now(): Long = SystemClock.elapsedRealtimeNanos()

  private fun handles(keyCode: Int): Boolean = when (mode) {
    Mode.OFF -> false
    Mode.CAPTURE -> keyCode in keys
    Mode.LEARN -> keyCode !in systemKeys
  }

  /** True when the key was taken, so the volume does not change and the volume panel does not cover the screen. */
  fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    // Read first: the time of the press is the time the activity received it.
    val at = now()
    if (!handles(keyCode)) return false
    // A held button repeats ACTION_DOWN; only the first one is a press.
    if (event == null || event.repeatCount == 0) {
      val device = event?.device
      listener?.invoke(
        mapOf(
          "keyCode" to keyCode,
          "at" to at.toString(),
          "external" to (device != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && device.isExternal),
          "device" to device?.name,
        ),
      )
      // A learned key is reported once; the next keys go back to the system.
      if (mode == Mode.LEARN) {
        learnedKey = keyCode
        mode = Mode.OFF
      }
    }
    return true
  }

  // The UP of the key just learned must be taken too, or it would change the volume after the screen closes.
  @Volatile private var learnedKey: Int? = null

  fun onKeyUp(keyCode: Int): Boolean {
    if (keyCode == learnedKey) {
      learnedKey = null
      return true
    }
    return handles(keyCode)
  }
}
