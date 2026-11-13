// SPDX-License-Identifier: GPL-3.0-or-later
package it.tabboz.simulator

import android.app.Application
import android.content.Context
import android.os.Bundle
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.crashlytics.FirebaseCrashlytics

class TabbozApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
        Telemetry.apply(this)
    }
}

object Telemetry {
    private fun prefs(context: Context) = context.getSharedPreferences("tabboz.privacy", Context.MODE_PRIVATE)
    fun analytics(context: Context) = prefs(context).getBoolean("analytics", true)
    fun crashes(context: Context) = prefs(context).getBoolean("crashes", true)
    fun set(context: Context, analytics: Boolean? = null, crashes: Boolean? = null) {
        val editor = prefs(context).edit()
        analytics?.let { editor.putBoolean("analytics", it) }
        crashes?.let { editor.putBoolean("crashes", it) }
        editor.apply()
        apply(context)
        if (analytics == false) FirebaseAnalytics.getInstance(context).resetAnalyticsData()
        if (crashes == false) FirebaseCrashlytics.getInstance().deleteUnsentReports()
    }
    fun apply(context: Context) {
        val client = FirebaseAnalytics.getInstance(context)
        client.setConsent(mapOf(
            FirebaseAnalytics.ConsentType.ANALYTICS_STORAGE to if (analytics(context)) FirebaseAnalytics.ConsentStatus.GRANTED else FirebaseAnalytics.ConsentStatus.DENIED,
            FirebaseAnalytics.ConsentType.AD_STORAGE to FirebaseAnalytics.ConsentStatus.DENIED,
            FirebaseAnalytics.ConsentType.AD_USER_DATA to FirebaseAnalytics.ConsentStatus.DENIED,
            FirebaseAnalytics.ConsentType.AD_PERSONALIZATION to FirebaseAnalytics.ConsentStatus.DENIED))
        client.setAnalyticsCollectionEnabled(analytics(context))
        FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(crashes(context))
    }
    fun event(context: Context, name: String, parameters: Bundle = Bundle()) {
        if (analytics(context)) FirebaseAnalytics.getInstance(context).logEvent(name, parameters)
    }
    fun diagnostic(context: Context, code: String) {
        // Never send JavaScript messages, character data, filenames or navigation URLs.
        if (crashes(context)) FirebaseCrashlytics.getInstance().recordException(IllegalStateException("tabboz_$code"))
    }
}
