package app.homedesk.widget

import android.content.Context
import java.time.LocalDate

/** 위젯 주소와 위젯에서 고른 날짜를 보관한다. 앱 전용 저장소라 다른 앱은 읽지 못한다. */
object Prefs {
    private const val FILE = "homedesk"
    private const val KEY_URL = "widget_url"
    private const val KEY_SEL = "selected_date"
    private const val KEY_SEL_ON = "selected_on"

    fun url(ctx: Context): String? =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY_URL, null)

    fun saveUrl(ctx: Context, url: String) {
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY_URL, url.trim()).apply()
    }

    /** 오늘 고른 날짜. 하루가 지나면 고른 것을 잊고 다시 오늘을 보여준다. */
    fun selected(ctx: Context, today: LocalDate): LocalDate? {
        val p = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        if (p.getString(KEY_SEL_ON, null) != today.toString()) return null
        return p.getString(KEY_SEL, null)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    }

    fun select(ctx: Context, date: LocalDate?, today: LocalDate) {
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putString(KEY_SEL, date?.toString())
            .putString(KEY_SEL_ON, today.toString())
            .commit() // 곧바로 다시 그리는 작업이 읽으므로 기다렸다 쓴다
    }
}
