package app.homedesk.widget

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView

/** 위젯 주소를 붙여넣고 저장하는 화면 하나. 저장하면 미리보기를 보여주고 위젯을 다시 그린다. */
class MainActivity : Activity() {

    private lateinit var input: EditText
    private lateinit var status: TextView
    private lateinit var preview: ImageView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        input = findViewById(R.id.url_input)
        status = findViewById(R.id.status)
        preview = findViewById(R.id.preview)

        Prefs.url(this)?.let { input.setText(it); showPreview(it) }

        findViewById<Button>(R.id.paste).setOnClickListener {
            val clip = (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip
            val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
            input.setText(text.trim())
        }

        findViewById<Button>(R.id.save).setOnClickListener {
            val url = input.text.toString().trim()
            if (!WidgetUrl.isValid(url)) {
                status.text = getString(R.string.invalid_url)
                return@setOnClickListener
            }
            Prefs.saveUrl(this, url)
            WidgetUpdater.schedule(this)
            WidgetUpdater.refreshNow(this)
            showPreview(url)
        }
    }

    private fun showPreview(url: String) {
        status.text = getString(R.string.loading)
        val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        Thread {
            val result = CalendarFetch.fetch(WidgetUrl.imageUrl(url, 1000, 1040, dark))
            runOnUiThread {
                when (result) {
                    is FetchResult.Ok -> {
                        preview.setImageBitmap(result.bitmap)
                        preview.visibility = View.VISIBLE
                        status.text = getString(R.string.saved)
                    }
                    FetchResult.Revoked -> {
                        preview.visibility = View.GONE
                        status.text = getString(R.string.revoked)
                    }
                    is FetchResult.Failed -> status.text = result.reason
                }
            }
        }.start()
    }
}
