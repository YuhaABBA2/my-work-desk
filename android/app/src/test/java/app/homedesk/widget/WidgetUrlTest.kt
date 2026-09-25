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

    @Test fun 누르면_그_날_창을_여는_데스크_주소() {
        assertEquals("https://my-work-desk.vercel.app/?d=2026-09-25", WidgetUrl.deskUrl(LocalDate.of(2026, 9, 25)))
    }
}
