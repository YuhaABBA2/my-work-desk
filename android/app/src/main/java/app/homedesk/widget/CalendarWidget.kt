package app.homedesk.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle

/** 홈화면 달력 위젯. 그리는 일은 전부 WidgetUpdater(백그라운드)가 한다. */
class CalendarWidget : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        WidgetUpdater.schedule(ctx)
        WidgetUpdater.refreshNow(ctx)
    }

    // 사용자가 위젯 크기를 바꾸면 그 크기로 다시 받아 선명하게 그린다.
    override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, newOptions: Bundle) {
        WidgetUpdater.refreshNow(ctx)
    }

    override fun onEnabled(ctx: Context) = WidgetUpdater.schedule(ctx)

    override fun onDisabled(ctx: Context) = WidgetUpdater.cancel(ctx)

    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == ACTION_REFRESH) WidgetUpdater.refreshNow(ctx) else super.onReceive(ctx, intent)
    }

    companion object {
        const val ACTION_REFRESH = "app.homedesk.widget.REFRESH"

        fun refreshIntent(ctx: Context): PendingIntent {
            val i = Intent(ctx, CalendarWidget::class.java).setAction(ACTION_REFRESH)
            return PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
    }
}
