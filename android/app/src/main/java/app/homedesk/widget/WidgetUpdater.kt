package app.homedesk.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/** 모든 달력 위젯을 다시 그린다. 30분 주기 + 위젯 추가·크기 변경·↻ 버튼·앱에서 저장할 때. */
class WidgetUpdater(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val mgr = AppWidgetManager.getInstance(ctx)
        val ids = mgr.getAppWidgetIds(ComponentName(ctx, CalendarWidget::class.java))
        if (ids.isEmpty()) return Result.success()

        val saved = Prefs.url(ctx)
        if (saved == null || !WidgetUrl.isValid(saved)) {
            ids.forEach { mgr.updateAppWidget(it, message(ctx, ctx.getString(R.string.need_setup))) }
            return Result.success()
        }

        val dark = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        val density = ctx.resources.displayMetrics.density
        val today = LocalDate.now()
        val selected = Prefs.selected(ctx, today)

        for (id in ids) {
            val opts = mgr.getAppWidgetOptions(id)
            // 세로 화면 기준: 폭은 MIN_WIDTH, 높이는 MAX_HEIGHT 가 실제 크기다.
            val widthDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
            val (w, h) = WidgetUrl.pixelSize(widthDp, opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT), density)
            val result = withContext(Dispatchers.IO) {
                CalendarFetch.fetch(WidgetUrl.imageUrl(saved, w, h, dark, selected))
            }
            when (result) {
                is FetchResult.Ok -> {
                    val viewWidthPx = (if (widthDp > 0) widthDp else 320) * density
                    val views = base(ctx, today, selected, viewWidthPx)
                    views.setImageViewBitmap(R.id.image, result.bitmap)
                    views.setViewVisibility(R.id.image, View.VISIBLE)
                    views.setViewVisibility(R.id.status, View.GONE)
                    mgr.updateAppWidget(id, views)
                }
                // 주소가 새로 만들어졌거나 폐기됨 — 옛 그림을 계속 보여주면 안 된다.
                FetchResult.Revoked -> mgr.updateAppWidget(id, message(ctx, ctx.getString(R.string.revoked)))
                // 잠깐의 실패는 마지막 그림을 그대로 두고 작은 안내만 띄운다.
                is FetchResult.Failed -> {
                    val views = RemoteViews(ctx.packageName, R.layout.widget_calendar)
                    views.setTextViewText(R.id.status, result.reason)
                    views.setViewVisibility(R.id.status, View.VISIBLE)
                    mgr.partiallyUpdateAppWidget(id, views)
                }
            }
        }
        return Result.success()
    }

    companion object {
        private const val PERIODIC = "calendar-periodic"
        private const val NOW = "calendar-now"

        /** 30분마다. 위젯이 하나라도 있는 동안 늘 걸어 둔다(WorkManager 가 켜고 끄는 부품이 위젯 갱신을 되부르는 루프를 막는다). */
        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<WidgetUpdater>(30, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun refreshNow(ctx: Context) {
            WorkManager.getInstance(ctx)
                .enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<WidgetUpdater>().build())
        }

        fun cancel(ctx: Context) {
            WorkManager.getInstance(ctx).cancelUniqueWork(PERIODIC)
        }

        private val ROW_IDS = intArrayOf(R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4, R.id.row5)
        private val CELL_IDS = intArrayOf(
            R.id.c0, R.id.c1, R.id.c2, R.id.c3, R.id.c4, R.id.c5, R.id.c6,
            R.id.c7, R.id.c8, R.id.c9, R.id.c10, R.id.c11, R.id.c12, R.id.c13,
            R.id.c14, R.id.c15, R.id.c16, R.id.c17, R.id.c18, R.id.c19, R.id.c20,
            R.id.c21, R.id.c22, R.id.c23, R.id.c24, R.id.c25, R.id.c26, R.id.c27,
            R.id.c28, R.id.c29, R.id.c30, R.id.c31, R.id.c32, R.id.c33, R.id.c34,
            R.id.c35, R.id.c36, R.id.c37, R.id.c38, R.id.c39, R.id.c40, R.id.c41,
        )

        /**
         * 그림 + 누르는 영역. 달력 칸 → 그 날을 골라 목록을 바꾼다(앱이 열리지 않는다),
         * 목록 → 데스크를 그 날 창으로, 제목(9월) → 오늘로 돌아가기, ＋ → 그 날로 일정 추가, ↻ → 새로 고침.
         */
        private fun base(ctx: Context, today: LocalDate, selected: LocalDate?, viewWidthPx: Float): RemoteViews {
            val views = RemoteViews(ctx.packageName, R.layout.widget_calendar)
            val cells = WidgetUrl.monthCells(today.year, today.monthValue)
            val rows = cells.size / 7
            ROW_IDS.forEachIndexed { r, rowId -> views.setViewVisibility(rowId, if (r < rows) View.VISIBLE else View.GONE) }
            cells.forEachIndexed { i, d -> views.setOnClickPendingIntent(CELL_IDS[i], CalendarWidget.selectIntent(ctx, d, 100 + i)) }
            // 그림의 좌우 여백(LAYOUT.padX)만큼 격자를 안쪽으로 — 칸 폭을 그림과 맞춘다
            val pad = (viewWidthPx * WidgetLayout.PAD_X).toInt()
            views.setViewPadding(R.id.grid, pad, 0, pad, 0)

            // 제목 줄: ＋ → 고른 날(없으면 오늘)로 일정 추가, 나머지 → 오늘로 돌아가기
            views.setOnClickPendingIntent(R.id.header_today, CalendarWidget.selectIntent(ctx, null, 99))
            views.setOnClickPendingIntent(R.id.header_rest, CalendarWidget.selectIntent(ctx, null, 98))
            val add = Intent(Intent.ACTION_VIEW, Uri.parse(WidgetUrl.addUrl(selected ?: today)))
            views.setOnClickPendingIntent(
                R.id.header_add,
                PendingIntent.getActivity(ctx, 2, add, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
            )
            val open = Intent(Intent.ACTION_VIEW, Uri.parse(WidgetUrl.deskUrl(selected ?: today)))
            views.setOnClickPendingIntent(
                R.id.list,
                PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
            )
            views.setOnClickPendingIntent(R.id.refresh, CalendarWidget.refreshIntent(ctx))
            return views
        }

        /** 그림 없이 안내 문구만. 누르면 이 앱이 열려 주소를 다시 넣을 수 있다. */
        private fun message(ctx: Context, text: String): RemoteViews {
            val views = RemoteViews(ctx.packageName, R.layout.widget_calendar)
            views.setViewVisibility(R.id.image, View.GONE)
            views.setTextViewText(R.id.status, text)
            views.setViewVisibility(R.id.status, View.VISIBLE)
            val app = Intent(ctx, MainActivity::class.java)
            views.setOnClickPendingIntent(
                R.id.root,
                PendingIntent.getActivity(ctx, 1, app, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
            )
            views.setOnClickPendingIntent(R.id.refresh, CalendarWidget.refreshIntent(ctx))
            return views
        }
    }
}
