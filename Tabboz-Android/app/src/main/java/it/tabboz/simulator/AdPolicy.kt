// SPDX-License-Identifier: GPL-3.0-or-later
package it.tabboz.simulator

data class AdState(
    var played: Double = 0.0,
    var sinceFullscreen: Double = 0.0,
    var totalActivities: Int = 0,
    var sinceFullscreenActivities: Int = 0,
    val forced: MutableList<Long> = mutableListOf(),
    val rewards: MutableList<Long> = mutableListOf(),
    var rewardRemaining: Double = 0.0,
    val earnedTokens: MutableList<String> = mutableListOf(),
    var backgroundedAt: Long? = null
)

/** Only foreground gameplay time supplied by the native coordinator is counted. */
class AdPolicy(val state: AdState = AdState(), private val save: (AdState) -> Unit = {}) {
    var enabled = true
    var cooldown = 240.0
    var sessionPlayed = 0.0
        private set

    fun persist() = save(state)
    fun advance(seconds: Double) {
        if (!seconds.isFinite() || seconds <= 0 || seconds > 5) return
        state.played += seconds
        state.sinceFullscreen += seconds
        sessionPlayed += seconds
        state.rewardRemaining = (state.rewardRemaining - seconds).coerceAtLeast(0.0)
    }
    fun background(now: Long) { state.backgroundedAt = now; persist() }
    fun foreground(now: Long) {
        if (state.backgroundedAt?.let { now - it >= 1_800_000 } == true) sessionPlayed = 0.0
        state.backgroundedAt = null
    }
    fun completedActivity() {
        state.totalActivities++
        state.sinceFullscreenActivities++
        persist()
    }
    fun canShowForced(now: Long) = enabled && state.played >= 300 && sessionPlayed >= 90 &&
        state.totalActivities >= 5 && state.sinceFullscreenActivities >= 5 &&
        state.sinceFullscreen >= cooldown.coerceIn(240.0, 1800.0) && state.rewardRemaining <= 0 &&
        state.forced.count { now - it < 1_800_000 } < 3 &&
        state.forced.count { now - it < 86_400_000 } < 12
    fun canOfferReward(now: Long) = enabled && state.rewardRemaining <= 0 &&
        state.rewards.count { now - it < 86_400_000 } < 3
    fun fullscreenStarted(forced: Boolean, now: Long) {
        state.sinceFullscreen = 0.0
        state.sinceFullscreenActivities = 0
        if (forced) state.forced.add(now)
        state.forced.removeAll { now - it >= 86_400_000 }
        persist()
    }
    fun fullscreenEnded(presented: Boolean = true) {
        if (presented) { state.sinceFullscreen = 0.0; persist() }
    }
    fun earnReward(token: String, now: Long): Boolean {
        if (state.earnedTokens.contains(token)) return false
        state.earnedTokens.add(token)
        while (state.earnedTokens.size > 32) state.earnedTokens.removeAt(0)
        state.rewardRemaining = maxOf(state.rewardRemaining, 600.0)
        state.rewards.removeAll { now - it >= 86_400_000 }
        state.rewards.add(now)
        persist()
        return true
    }
}
