// SPDX-License-Identifier: GPL-3.0-or-later
package it.tabboz.simulator

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class AdPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("tabboz.ads.v1", Context.MODE_PRIVATE)
    fun load(): AdState = runCatching {
        val j = JSONObject(prefs.getString("policy", "{}") ?: "{}")
        fun times(name: String) = (j.optJSONArray(name) ?: JSONArray()).let { a ->
            MutableList(a.length()) { a.getLong(it) }
        }
        AdState(j.optDouble("played", 0.0), j.optDouble("sinceFullscreen", 0.0),
            j.optInt("totalActivities"), j.optInt("sinceFullscreenActivities"),
            times("forced"), times("rewards"), j.optDouble("rewardRemaining", 0.0),
            (j.optJSONArray("earnedTokens") ?: JSONArray()).let { a -> MutableList(a.length()) { a.getString(it) } },
            if (j.has("backgroundedAt")) j.getLong("backgroundedAt") else null)
    }.getOrDefault(AdState())
    fun save(state: AdState) {
        val j = JSONObject().put("played", state.played).put("sinceFullscreen", state.sinceFullscreen)
            .put("totalActivities", state.totalActivities).put("sinceFullscreenActivities", state.sinceFullscreenActivities)
            .put("forced", JSONArray(state.forced)).put("rewards", JSONArray(state.rewards))
            .put("rewardRemaining", state.rewardRemaining).put("earnedTokens", JSONArray(state.earnedTokens))
        state.backgroundedAt?.let { j.put("backgroundedAt", it) }
        prefs.edit().putString("policy", j.toString()).apply()
    }
}
