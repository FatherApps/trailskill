package expo.modules.timingbutton

import android.content.Context
import android.hardware.input.InputManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TimingButtonModule : Module() {
  private val inputManager: InputManager?
    get() = appContext.reactContext?.getSystemService(Context.INPUT_SERVICE) as? InputManager

  private val deviceListener = object : InputManager.InputDeviceListener {
    override fun onInputDeviceAdded(deviceId: Int) = notifyDevices()
    override fun onInputDeviceRemoved(deviceId: Int) = notifyDevices()
    override fun onInputDeviceChanged(deviceId: Int) = notifyDevices()
  }

  private fun notifyDevices() {
    sendEvent("onDevicesChanged", mapOf("keyboards" to keyboards()))
  }

  // External devices that send keys: a USB headset with inline buttons, or a Bluetooth button.
  private fun keyboards(): List<Map<String, Any?>> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return emptyList()
    return InputDevice.getDeviceIds().toList().mapNotNull { id ->
      val device = InputDevice.getDevice(id) ?: return@mapNotNull null
      val sendsKeys = device.sources and InputDevice.SOURCE_KEYBOARD == InputDevice.SOURCE_KEYBOARD
      if (device.isVirtual || !device.isExternal || !sendsKeys) null else mapOf("id" to id, "name" to device.name)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("TimingButton")

    Events("onKey", "onDevicesChanged")

    OnStartObserving {
      TimingButtonCapture.listener = { body -> sendEvent("onKey", body) }
      inputManager?.registerInputDeviceListener(deviceListener, Handler(Looper.getMainLooper()))
    }

    OnStopObserving {
      TimingButtonCapture.listener = null
      TimingButtonCapture.mode = TimingButtonCapture.Mode.OFF
      inputManager?.unregisterInputDeviceListener(deviceListener)
    }

    OnDestroy {
      TimingButtonCapture.listener = null
      TimingButtonCapture.mode = TimingButtonCapture.Mode.OFF
    }

    // A string: nanoseconds since boot do not fit a JavaScript number exactly after about 104 days.
    Function("now") { TimingButtonCapture.now().toString() }

    Function("capture") { keyCodes: List<Int> ->
      TimingButtonCapture.keys = keyCodes.toSet()
      TimingButtonCapture.mode = TimingButtonCapture.Mode.CAPTURE
    }

    Function("learn") { TimingButtonCapture.mode = TimingButtonCapture.Mode.LEARN }

    Function("stop") { TimingButtonCapture.mode = TimingButtonCapture.Mode.OFF }

    Function("keyboards") { keyboards() }
  }
}
