package app.homedesk.widget

import android.content.Context

/** 위젯 주소 한 개만 보관한다. 앱 전용 저장소라 다른 앱은 읽지 못한다. */
object Prefs {
    private const val FILE = "homedesk"
    private const val KEY_URL = "widget_url"

    fun url(ctx: Context): String? =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY_URL, null)

    fun saveUrl(ctx: Context, url: String) {
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY_URL, url.trim()).apply()
    }
}
