package expo.modules.timingbutton

import android.content.Context
import android.view.KeyEvent
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityHandler

// Expo autolinking finds this Package and passes the activity's key events to it, so MainActivity needs no change.
class TimingButtonPackage : Package {
  override fun createReactActivityHandlers(activityContext: Context?): List<ReactActivityHandler> =
    listOf(
      object : ReactActivityHandler {
        override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean = TimingButtonCapture.onKeyDown(keyCode, event)

        override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean = TimingButtonCapture.onKeyUp(keyCode)
      },
    )
}
