package it.tabboz.simulator

import org.junit.Assert.*
import org.junit.Test

class AdPolicyTest {
    private val now = 1_800_000_000_000L
    private fun play(p: AdPolicy, seconds: Int = 300) { repeat(seconds) { p.advance(1.0) } }
    private fun activities(p: AdPolicy, count: Int = 5) { repeat(count) { p.completedActivity() } }
    @Test fun firstGraceRequiresBothTimeAndCompletedActivities() {
        val p = AdPolicy(); play(p, 299); activities(p)
        assertFalse(p.canShowForced(now)); p.advance(1.0); assertTrue(p.canShowForced(now))
    }
    @Test fun openingDialogsIsNotCounted() {
        val p = AdPolicy(); play(p); assertFalse(p.canShowForced(now))
        activities(p, 4); assertFalse(p.canShowForced(now)); activities(p, 1); assertTrue(p.canShowForced(now))
    }
    @Test fun subsequentAdRequiresCooldownAndNewActivities() {
        val p = AdPolicy(); play(p); activities(p); p.fullscreenStarted(true, now); p.fullscreenEnded()
        play(p, 239); activities(p); assertFalse(p.canShowForced(now + 240_000))
        p.advance(1.0); assertTrue(p.canShowForced(now + 240_000))
    }
    @Test fun shortLaunchesAccumulateButReturningSessionHasGrace() {
        var saved = AdState()
        var p = AdPolicy(save = { saved = it.copy() })
        play(p, 120); activities(p); p.persist()
        p = AdPolicy(saved); play(p, 120); p.persist()
        p = AdPolicy(saved); play(p, 60); assertFalse(p.canShowForced(now))
        play(p, 30); assertTrue(p.canShowForced(now))
    }
    @Test fun halfHourAndDailyCapsSurviveRecreation() {
        val s = AdState(played = 400.0, sinceFullscreen = 300.0, totalActivities = 20, sinceFullscreenActivities = 5)
        s.forced.addAll(listOf(now - 1000, now - 500_000, now - 900_000))
        val p = AdPolicy(s); play(p, 90); assertFalse(p.canShowForced(now))
        assertTrue(p.canShowForced(now + 1_800_000))
        s.forced.clear(); repeat(12) { s.forced.add(now - 2_000_000 - it * 1000) }
        assertFalse(p.canShowForced(now)); assertTrue(p.canShowForced(now + 86_400_000))
    }
    @Test fun clockRollbackCannotEraseCaps() {
        val p = AdPolicy(); play(p); activities(p); repeat(3) { p.state.forced.add(now) }
        assertFalse(p.canShowForced(now - 86_400_000))
    }
    @Test fun rewardRequiresUniqueCallbackAndConsumesOnlyForegroundTime() {
        val p = AdPolicy(); play(p); activities(p)
        assertTrue(p.earnReward("earned", now)); assertFalse(p.earnReward("earned", now))
        p.background(now); p.foreground(now + 4_000_000)
        assertEquals(600.0, p.state.rewardRemaining, 0.0)
        assertFalse(p.canShowForced(now)); play(p, 600); assertTrue(p.canShowForced(now + 4_600_000))
    }
    @Test fun rewardCapAndNoStacking() {
        val p = AdPolicy(); assertTrue(p.canOfferReward(now))
        repeat(3) { assertTrue(p.earnReward("reward$it", now)); play(p, 600) }
        assertFalse(p.canOfferReward(now)); assertTrue(p.canOfferReward(now + 86_400_000))
    }
    @Test fun skippedFullscreenPreservesCooldown() {
        val p = AdPolicy(); play(p); activities(p); p.fullscreenEnded(false)
        assertTrue(p.canShowForced(now)); assertEquals(300.0, p.state.sinceFullscreen, 0.0)
    }
    @Test fun backgroundSessionGraceAndInvalidTime() {
        val p = AdPolicy(); play(p); activities(p); p.background(now); p.foreground(now + 1_800_000)
        assertFalse(p.canShowForced(now)); play(p, 90); assertTrue(p.canShowForced(now))
        val previous = p.state.played
        listOf(Double.NaN, Double.POSITIVE_INFINITY, -1.0, 6.0).forEach(p::advance)
        assertEquals(previous, p.state.played, 0.0)
    }
    @Test fun remoteConfigCannotIncreasePressurePastBundledMinimum() {
        val p = AdPolicy(); play(p); activities(p); p.fullscreenStarted(true, now); activities(p)
        p.cooldown = 1.0; play(p, 239); assertFalse(p.canShowForced(now + 239_000))
        p.advance(1.0); assertTrue(p.canShowForced(now + 240_000))
        p.enabled = false; assertFalse(p.canShowForced(now)); assertFalse(p.canOfferReward(now))
    }
}
