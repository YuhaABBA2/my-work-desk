package app.homedesk.widget

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.net.HttpURLConnection
import java.net.URL

/** 서버에서 달력 그림을 받는다. 결과는 세 가지 — 그림 / 주소가 막힘(401) / 그 밖의 실패. */
sealed class FetchResult {
    data class Ok(val bitmap: Bitmap) : FetchResult()
    object Revoked : FetchResult()
    data class Failed(val reason: String) : FetchResult()
}

object CalendarFetch {
    fun fetch(imageUrl: String): FetchResult {
        val conn = (URL(imageUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 20_000
            useCaches = false
        }
        return try {
            when (val code = conn.responseCode) {
                200 -> conn.inputStream.use { s ->
                    BitmapFactory.decodeStream(s)?.let { FetchResult.Ok(it) } ?: FetchResult.Failed("그림을 읽지 못했어요")
                }
                401 -> FetchResult.Revoked
                else -> FetchResult.Failed("서버 응답 $code")
            }
        } catch (e: Exception) {
            FetchResult.Failed("인터넷 연결을 확인해 주세요")
        } finally {
            conn.disconnect()
        }
    }
}
