package app.homedesk.widget

/**
 * 위젯 그림에서 달력 칸이 놓이는 자리(비율). 서버 pig-farm-log lib/widget-layout.ts LAYOUT 과
 * **같은 숫자**여야 누른 칸과 그림의 칸이 맞는다. 레이아웃 widget_calendar.xml 의 무게(15/47/38)도 같다.
 */
object WidgetLayout {
    const val PAD_X = 0.04f
    const val GRID_TOP = 0.15f
    const val GRID_BOTTOM = 0.62f
    const val MAX_ROWS = 6
}
