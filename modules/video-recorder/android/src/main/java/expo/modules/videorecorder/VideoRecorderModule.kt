package expo.modules.videorecorder

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
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

private const val PICK_VIDEO = 0x1201

class VideoRecorderModule : Module() {
  // The video picker that is open, waiting for the person's choice (#1201).
  private var picking: Promise? = null

  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("VideoRecorder")

    // Sharing a time's video (#1201): Android's share menu with the gallery file itself, so it keeps its name (the time's id).
    AsyncFunction("shareVideo") { uri: String, title: String ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val send =
        Intent(Intent.ACTION_SEND).apply {
          type = "video/mp4"
          putExtra(Intent.EXTRA_STREAM, Uri.parse(uri))
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      activity.runOnUiThread { activity.startActivity(Intent.createChooser(send, title)) }
    }

    // The system's file picker, limited to videos: no permission to read the gallery is needed. Resolves with the chosen
    // file's uri and name, or null when the person goes back without choosing.
    AsyncFunction("pickVideo") { promise: Promise ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      picking?.resolve(null)
      picking = promise
      val pick =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "video/*"
        }
      activity.runOnUiThread { activity.startActivityForResult(pick, PICK_VIDEO) }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != PICK_VIDEO) return@OnActivityResult
      val promise = picking ?: return@OnActivityResult
      picking = null
      val uri = payload.data?.data
      if (payload.resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(null)
        return@OnActivityResult
      }
      promise.resolve(mapOf("uri" to uri.toString(), "name" to displayName(uri)))
    }

    // Copies a chosen video into the app's cache under `name`.mp4 and returns the copy's file uri.
    AsyncFunction("copyToCache") { uri: String, name: String ->
      val target = java.io.File(context.cacheDir, "$name.mp4")
      val input = context.contentResolver.openInputStream(Uri.parse(uri)) ?: throw java.io.IOException("Cannot read $uri")
      input.use { source -> target.outputStream().use { source.copyTo(it) } }
      Uri.fromFile(target).toString()
    }

    // Deletes a chosen file once the app has its own copy, where its provider allows it. False when it stays.
    AsyncFunction("deleteDocument") { uri: String ->
      try {
        DocumentsContract.deleteDocument(context.contentResolver, Uri.parse(uri))
      } catch (_: Exception) {
        false
      }
    }

    // The same clock as the timing buttons (SystemClock.elapsedRealtimeNanos), as a decimal string.
    Function("now") { SystemClock.elapsedRealtimeNanos().toString() }

    View(VideoRecorderView::class) {
      Events("onReady", "onError")

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

  private fun displayName(uri: Uri): String? =
    try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (_: Exception) {
      null
    }
}
