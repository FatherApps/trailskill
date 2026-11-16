package expo.modules.videorecorder

import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** What the stopwatch strip drawn into the video shows. Times are strings of nanoseconds in the timing-button clock. */
class OverlayRecord : Record {
  @Field var enabled: Boolean = false
  @Field var event: String = ""
  @Field var startedAt: String? = null
  @Field var stoppedAt: String? = null
  @Field var splits: List<String> = emptyList()
  @Field var thousandths: Boolean = false
}

class VideoRecorderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VideoRecorder")

    // The same clock as the timing buttons (SystemClock.elapsedRealtimeNanos), as a decimal string.
    Function("now") { SystemClock.elapsedRealtimeNanos().toString() }

    View(VideoRecorderView::class) {
      Events("onReady")

      Prop("quality") { view: VideoRecorderView, quality: String -> view.setQuality(quality) }

      Prop("audio") { view: VideoRecorderView, audio: Boolean -> view.audio = audio }

      Prop("overlay") { view: VideoRecorderView, overlay: OverlayRecord? ->
        view.overlay =
          if (overlay == null || !overlay.enabled) StopwatchOverlay.OFF
          else
            StopwatchOverlay(
              enabled = true,
              event = overlay.event,
              startedAt = overlay.startedAt?.toLongOrNull(),
              stoppedAt = overlay.stoppedAt?.toLongOrNull(),
              splits = overlay.splits.mapNotNull { it.toLongOrNull() },
              thousandths = overlay.thousandths,
            )
      }

      // Resolves with the file's uri once the recording ends (stop, the time limit, or the camera closing), or null.
      AsyncFunction("record") { view: VideoRecorderView, promise: Promise -> view.record(promise) }

      AsyncFunction("stop") { view: VideoRecorderView -> view.stopRecording() }
    }
  }
}
