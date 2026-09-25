package app.homedesk.widget

import java.time.LocalDate
import kotlin.math.roundToInt

/** 안드로이드 API 없이 검사할 수 있는 순수 계산. WidgetUrlTest 가 지킨다. */
object WidgetUrl {
    const val PREFIX = "https://masan-farm.vercel.app/api/widget?token="
    private const val DESK = "https://my-work-desk.vercel.app/"
    private const val MAX_PX = 1200 // 서버가 받는 최대 크기 (pig-farm-log lib/widget-params.ts)

    /** 데스크 설정 › 홈화면 위젯 › [주소 복사] 로 받은 주소인가. 앞뒤 공백은 봐준다. */
    fun isValid(raw: String): Boolean {
        val s = raw.trim()
        if (!s.startsWith(PREFIX)) return false
        val token = s.removePrefix(PREFIX)
        return token.isNotEmpty() && token.none { it.isWhitespace() || it == '&' || it == '#' }
    }

    /** 위젯 실제 픽셀 크기·테마(·고른 날)를 붙인 그림 주소. 고른 날이 없으면 서버가 오늘 목록을 그린다. */
    fun imageUrl(saved: String, widthPx: Int, heightPx: Int, dark: Boolean, selected: LocalDate? = null): String =
        "${saved.trim()}&w=$widthPx&h=$heightPx&theme=${if (dark) "dark" else "light"}" +
            (selected?.let { "&sel=$it" } ?: "")

    /**
     * 그 달 달력 칸의 날짜들(일요일 시작, 주 단위). 서버 monthGrid 와 같은 규칙 —
     * 다음 달로만 찬 주는 없다. 누르는 영역을 이 순서로 깐다.
     */
    fun monthCells(year: Int, month: Int): List<LocalDate> {
        val first = LocalDate.of(year, month, 1)
        val lead = first.dayOfWeek.value % 7 // 일요일=0
        val weeks = (lead + first.lengthOfMonth() + 6) / 7
        val start = first.minusDays(lead.toLong())
        return (0 until weeks * 7).map { start.plusDays(it.toLong()) }
    }

    /**
     * 위젯 크기(dp) → 요청할 픽셀 크기. 비율을 지킨 채 서버 한도(1200) 안으로 줄인다.
     * 크기를 모르면(0) 4×4 기본값으로 어림한다.
     */
    fun pixelSize(widthDp: Int, heightDp: Int, density: Float): Pair<Int, Int> {
        val wDp = if (widthDp > 0) widthDp else 320
        val hDp = if (heightDp > 0) heightDp else 330
        var w = wDp * density
        var h = hDp * density
        val scale = minOf(1f, MAX_PX / maxOf(w, h))
        w *= scale; h *= scale
        return Pair(w.roundToInt().coerceAtLeast(120), h.roundToInt().coerceAtLeast(120))
    }

    /** 위젯을 누르면 여는 데스크 주소 — 그 날 창을 바로 연다. */
    fun deskUrl(today: LocalDate): String = "$DESK?d=$today"
}
