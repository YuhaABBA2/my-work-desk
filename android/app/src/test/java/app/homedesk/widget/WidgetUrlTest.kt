package app.homedesk.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class WidgetUrlTest {
    private val url = "https://masan-farm.vercel.app/api/widget?token=RnmfSE1ND7-_x"

    @Test fun 데스크에서_복사한_주소는_통과한다() {
        assertTrue(WidgetUrl.isValid(url))
        assertTrue(WidgetUrl.isValid("  $url\n"))
    }

    @Test fun 엉뚱한_주소는_막는다() {
        assertFalse(WidgetUrl.isValid(""))
        assertFalse(WidgetUrl.isValid("https://masan-farm.vercel.app/api/widget?token="))
        assertFalse(WidgetUrl.isValid("http://masan-farm.vercel.app/api/widget?token=abc"))
        assertFalse(WidgetUrl.isValid("https://evil.example/api/widget?token=abc"))
        assertFalse(WidgetUrl.isValid("$url&w=1"))
        assertFalse(WidgetUrl.isValid("https://masan-farm.vercel.app/api/widget?token=a b"))
    }

    @Test fun 그림_주소에_크기와_테마를_붙인다() {
        assertEquals("$url&w=1000&h=1030&theme=dark", WidgetUrl.imageUrl(" $url ", 1000, 1030, true))
        assertEquals("$url&w=500&h=400&theme=light", WidgetUrl.imageUrl(url, 500, 400, false))
    }

    @Test fun 픽셀_크기는_비율을_지킨_채_1200_안으로() {
        assertEquals(Pair(800, 840), WidgetUrl.pixelSize(320, 336, 2.5f))
        val (w, h) = WidgetUrl.pixelSize(400, 420, 3.5f) // 1400 x 1470 → 줄인다
        assertEquals(1200, h)
        assertEquals(1143, w)
    }

    @Test fun 크기를_모르면_기본값() {
        assertEquals(Pair(640, 660), WidgetUrl.pixelSize(0, 0, 2f))
    }

    @Test fun 고른_날이_있으면_sel_을_붙인다() {
        assertEquals("$url&w=10&h=20&theme=light&sel=2026-09-26",
            WidgetUrl.imageUrl(url, 10, 20, false, LocalDate.of(2026, 9, 26)))
    }

    @Test fun 달력_칸은_서버와_같은_규칙() {
        val sep = WidgetUrl.monthCells(2026, 9)
        assertEquals(35, sep.size)
        assertEquals(LocalDate.of(2026, 8, 30), sep.first())
        assertEquals(LocalDate.of(2026, 10, 3), sep.last())
        assertEquals(42, WidgetUrl.monthCells(2026, 5).size)   // 6주
        assertEquals(28, WidgetUrl.monthCells(2026, 2).size)   // 4주 — 1일이 일요일, 28일까지
        assertEquals(LocalDate.of(2026, 2, 1), WidgetUrl.monthCells(2026, 2).first())
    }

    @Test fun 레이아웃_비율은_서버_LAYOUT_과_같다() {
        // pig-farm-log lib/widget-layout.ts: { padX: 0.04, gridTop: 0.15, gridBottom: 0.62 }
        assertEquals(0.04f, WidgetLayout.PAD_X)
        assertEquals(0.15f, WidgetLayout.GRID_TOP)
        assertEquals(0.62f, WidgetLayout.GRID_BOTTOM)
        assertEquals(0.74f, WidgetLayout.ADD_X0)
        assertEquals(0.86f, WidgetLayout.ADD_X1)
    }

    @Test fun 더하기는_그_날짜로_추가_창을_연다() {
        assertEquals("https://my-work-desk.vercel.app/?add=2026-09-26", WidgetUrl.addUrl(LocalDate.of(2026, 9, 26)))
    }

    @Test fun 누르면_그_날_창을_여는_데스크_주소() {
        assertEquals("https://my-work-desk.vercel.app/?d=2026-09-25", WidgetUrl.deskUrl(LocalDate.of(2026, 9, 25)))
    }
}
