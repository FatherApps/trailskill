package expo.modules.videorecorder

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.camera.core.AspectRatio
import androidx.camera.core.CameraEffect
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.effects.OverlayEffect
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File

// The rear camera, full screen, with the stopwatch strip drawn into the recorded video (#1088). The screen shows the
// stopwatch with its own controls on top of the image, so the strip is drawn only into the video. Preview and video are
// both 16:9 and the preview fills the screen from the centre, so the video always holds at least what the screen shows.
class VideoRecorderView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  // PreviewView lays out its own children (the surface), so Android layout runs inside this view.
  override val shouldUseAndroidLayout = true

  private val onReady by EventDispatcher()

  private val previewView =
    PreviewView(context).apply {
      implementationMode = PreviewView.ImplementationMode.COMPATIBLE
      scaleType = PreviewView.ScaleType.FILL_CENTER
    }

  var audio: Boolean = true

  @Volatile var overlay: StopwatchOverlay = StopwatchOverlay.OFF

  private var quality: Quality = Quality.HD
  private var provider: ProcessCameraProvider? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var effect: OverlayEffect? = null
  private var preview: Preview? = null
  private var recording: Recording? = null
  private var pending: Promise? = null

  init {
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setQuality(value: String) {
    val next =
      when (value) {
        "low" -> Quality.SD
        "high" -> Quality.FHD
        else -> Quality.HD
      }
    if (next == quality) return
    quality = next
    // The quality is fixed while recording; it applies the next time the camera opens.
    if (recording == null && provider != null) bind()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    bind()
  }

  // The screen turns with the phone: the next video is recorded the way the phone is held.
  override fun onConfigurationChanged(newConfig: Configuration?) {
    super.onConfigurationChanged(newConfig)
    val rotation = display?.rotation ?: return
    preview?.targetRotation = rotation
    if (recording == null) videoCapture?.targetRotation = rotation
  }

  override fun onDetachedFromWindow() {
    stopRecording()
    provider?.unbindAll()
    effect?.close()
    effect = null
    preview = null
    videoCapture = null
    super.onDetachedFromWindow()
  }

  private fun bind() {
    val owner = appContext.currentActivity as? LifecycleOwner ?: return
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener(
      {
        val cameraProvider = runCatching { future.get() }.getOrNull() ?: return@addListener
        provider = cameraProvider
        val selector =
          ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY).build()
        val livePreview =
          Preview.Builder().setResolutionSelector(selector).build().also { it.surfaceProvider = previewView.surfaceProvider }
        val recorder =
          Recorder.Builder()
            .setAspectRatio(AspectRatio.RATIO_16_9)
            .setQualitySelector(QualitySelector.from(quality, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
            .build()
        val capture = VideoCapture.withOutput(recorder)
        display?.rotation?.let {
          livePreview.targetRotation = it
          capture.targetRotation = it
        }
        val overlayEffect = OverlayEffect(CameraEffect.VIDEO_CAPTURE, 0, Handler(Looper.getMainLooper())) {}
        overlayEffect.setOnDrawListener { frame ->
          overlay.draw(
            frame.overlayCanvas,
            frame.size.width.toFloat(),
            frame.size.height.toFloat(),
            frame.rotationDegrees,
            frame.cropRect,
          )
          true
        }
        val group = UseCaseGroup.Builder().addUseCase(livePreview).addUseCase(capture).addEffect(overlayEffect).build()
        runCatching {
          cameraProvider.unbindAll()
          cameraProvider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, group)
        }.onSuccess {
          effect?.close()
          effect = overlayEffect
          preview = livePreview
          videoCapture = capture
          onReady(mapOf())
        }
      },
      ContextCompat.getMainExecutor(context),
    )
  }

  @SuppressLint("MissingPermission")
  fun record(promise: Promise) {
    val capture = videoCapture
    if (capture == null || recording != null) {
      promise.resolve(null)
      return
    }
    val file = File(context.cacheDir, "trailskill-recording-${System.currentTimeMillis()}.mp4")
    // A safety limit for a recording nobody stops; the app also stops it a few seconds after the clock.
    val options = FileOutputOptions.Builder(file).setDurationLimitMillis(30 * 60 * 1000L).build()
    var prepared = capture.output.prepareRecording(context, options)
    val canHear = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    if (audio && canHear) prepared = prepared.withAudioEnabled()
    pending = promise
    recording =
      prepared.start(ContextCompat.getMainExecutor(context)) { event ->
        if (event !is VideoRecordEvent.Finalize) return@start
        recording = null
        val waiting = pending
        pending = null
        // A recording cut short (time limit, camera closed, low space) still keeps what was recorded.
        val kept = file.exists() && file.length() > 0 && event.error != VideoRecordEvent.Finalize.ERROR_NO_VALID_DATA
        if (kept) waiting?.resolve(Uri.fromFile(file).toString())
        else {
          file.delete()
          waiting?.resolve(null)
        }
      }
  }

  fun stopRecording() {
    recording?.stop()
  }
}
