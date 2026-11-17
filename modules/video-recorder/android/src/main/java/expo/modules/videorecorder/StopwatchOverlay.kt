package expo.modules.videorecorder

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.os.SystemClock

/**
 * The stopwatch strip drawn into every frame: a small dark, semi-transparent box in the top-left corner with the running
 * time, the event in small letters, the last split for a few seconds after it is marked, and the final time once stopped.
 * Kept small (about 5 % of the video's height) so it does not cover the swimmer.
 */
data class StopwatchOverlay(
  val enabled: Boolean,
  val event: String = "",
  val startedAt: Long? = null,
  val stoppedAt: Long? = null,
  val splits: List<Long> = emptyList(),
  val thousandths: Boolean = false,
) {
  companion object {
    val OFF = StopwatchOverlay(enabled = false)
    private const val SPLIT_SHOWN_NANOS = 3_000_000_000L
  }

  private val box = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(140, 0, 0, 0) }
  private val timePaint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
    }
  private val smallPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(230, 255, 255, 255) }

  /** Truncated, never rounded, as the app shows times: "0:31,45" or "0:31,456". */
  fun format(nanos: Long): String {
    val millis = maxOf(0L, nanos / 1_000_000L)
    val minutes = millis / 60_000L
    val seconds = (millis / 1000L) % 60L
    val fraction = if (thousandths) "%03d".format(millis % 1000L) else "%02d".format((millis % 1000L) / 10L)
    return "$minutes:${"%02d".format(seconds)},$fraction"
  }

  /**
   * Draws on a buffer of [bufferWidth] x [bufferHeight] whose content is shown rotated by [rotationDegrees] clockwise, so
   * the strip is upright in the video as people watch it. [crop] is the part of the buffer that ends up in the video; the
   * strip sits in its top-left corner, so a video cropped from a wider buffer does not cut it.
   */
  fun draw(
    canvas: Canvas,
    bufferWidth: Float,
    bufferHeight: Float,
    rotationDegrees: Int,
    crop: Rect? = null,
    now: Long = SystemClock.elapsedRealtimeNanos(),
  ) {
    canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    if (!enabled) return
    // Upright drawing coordinates -> buffer coordinates.
    val toBuffer = Matrix()
    when (((rotationDegrees % 360) + 360) % 360) {
      90 -> {
        toBuffer.setTranslate(0f, bufferHeight)
        toBuffer.preRotate(-90f)
      }
      180 -> {
        toBuffer.setTranslate(bufferWidth, bufferHeight)
        toBuffer.preRotate(180f)
      }
      270 -> {
        toBuffer.setTranslate(bufferWidth, 0f)
        toBuffer.preRotate(90f)
      }
    }
    val visible = RectF(crop?.let { RectF(it) } ?: RectF(0f, 0f, bufferWidth, bufferHeight))
    val toUpright = Matrix()
    toBuffer.invert(toUpright)
    toUpright.mapRect(visible)
    canvas.save()
    canvas.concat(toBuffer)
    canvas.translate(visible.left, visible.top)
    val width = visible.width()
    val height = visible.height()
    // Sized on the shorter side, so portrait and landscape videos get the same strip.
    val unit = minOf(width, height)

    val start = startedAt
    val elapsed = if (start == null) 0L else (stoppedAt ?: now) - start
    val time = format(elapsed)
    val lastSplit = splits.lastOrNull()
    val split =
      if (start != null && lastSplit != null && stoppedAt == null && now - lastSplit < SPLIT_SHOWN_NANOS)
        "Parcial ${splits.size} · ${format(lastSplit - start)}"
      else null

    timePaint.textSize = unit * 0.06f
    smallPaint.textSize = unit * 0.028f
    val padding = unit * 0.015f
    val margin = unit * 0.025f
    val lines = listOfNotNull(time to timePaint, event.takeIf { it.isNotBlank() }?.let { it to smallPaint }, split?.let { it to smallPaint })
    val boxWidth = lines.maxOf { (text, paint) -> paint.measureText(text) } + padding * 2
    val boxHeight = lines.sumOf { (_, paint) -> (paint.fontSpacing).toDouble() }.toFloat() + padding * 2
    canvas.drawRoundRect(RectF(margin, margin, margin + boxWidth, margin + boxHeight), padding, padding, box)

    var baseline = margin + padding
    for ((text, paint) in lines) {
      baseline += -paint.fontMetrics.ascent
      canvas.drawText(text, margin + padding, baseline, paint)
      baseline += paint.fontMetrics.descent + (paint.fontSpacing - (paint.fontMetrics.descent - paint.fontMetrics.ascent))
    }
    canvas.restore()
  }
}
