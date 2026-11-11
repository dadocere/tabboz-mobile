import XCTest
@testable import Tabboz

final class AdPolicyTests: XCTestCase {
    private var store: UserDefaults!
    private var suite: String!
    override func setUp() {
        suite = "it.tabboz.ads.tests.\(UUID().uuidString)"
        store = UserDefaults(suiteName: suite)!
    }
    override func tearDown() { store.removePersistentDomain(forName: suite) }
    private func play(_ policy: AdPolicy, seconds: Int = 300, activities: Int = 5) {
        for _ in 0..<seconds { policy.advance(1) }
        for _ in 0..<activities { policy.completedActivity() }
    }
    func testFirstPlayRequiresTimeAndCompletedActivities() {
        let policy = AdPolicy(defaults: store); let now = Date()
        play(policy, seconds: 299, activities: 5)
        XCTAssertFalse(policy.canShowForced(now: now))
        policy.advance(1); XCTAssertTrue(policy.canShowForced(now: now))
        policy.fullscreenStarted(forced: true, now: now); policy.fullscreenEnded()
        play(policy, seconds: 240, activities: 4)
        XCTAssertFalse(policy.canShowForced(now: now))
        policy.completedActivity(); XCTAssertTrue(policy.canShowForced(now: now))
    }
    func testCapsSurviveRelaunchAndExpireOnRollingWindow() {
        let now = Date(); var policy = AdPolicy(defaults: store)
        for _ in 0..<3 { play(policy); XCTAssertTrue(policy.canShowForced(now: now)); policy.fullscreenStarted(forced: true, now: now) }
        policy = AdPolicy(defaults: store)
        play(policy); XCTAssertFalse(policy.canShowForced(now: now.addingTimeInterval(1799)))
        XCTAssertTrue(policy.canShowForced(now: now.addingTimeInterval(1800)))
    }
    func testDailyCapCannotBeBypassedByRelaunch() {
        let start = Date(); var policy = AdPolicy(defaults: store)
        for group in 0..<4 {
            let now = start.addingTimeInterval(Double(group * 1900))
            for _ in 0..<3 { play(policy); XCTAssertTrue(policy.canShowForced(now: now)); policy.fullscreenStarted(forced: true, now: now) }
        }
        policy = AdPolicy(defaults: store); play(policy)
        XCTAssertFalse(policy.canShowForced(now: start.addingTimeInterval(8000)))
        XCTAssertTrue(policy.canShowForced(now: start.addingTimeInterval(86400)))
    }
    func testRewardIsIdempotentAndUnusedTimeSurvivesRelaunch() {
        let now = Date(); var policy = AdPolicy(defaults: store)
        play(policy)
        XCTAssertTrue(policy.earnReward(token: "one", now: now))
        XCTAssertFalse(policy.earnReward(token: "one", now: now))
        play(policy, seconds: 300)
        policy = AdPolicy(defaults: store)
        XCTAssertEqual(policy.state.rewardRemaining, 300)
        XCTAssertFalse(policy.canShowForced(now: now))
        play(policy, seconds: 300)
        XCTAssertTrue(policy.canShowForced(now: now))
    }
    func testRewardCapAndNoStacking() {
        let policy = AdPolicy(defaults: store); let now = Date()
        for index in 0..<3 {
            XCTAssertTrue(policy.canOfferReward(now: now))
            policy.earnReward(token: String(index), now: now)
            XCTAssertFalse(policy.canOfferReward(now: now))
            play(policy, seconds: 600)
        }
        XCTAssertFalse(policy.canOfferReward(now: now.addingTimeInterval(86399)))
        XCTAssertTrue(policy.canOfferReward(now: now.addingTimeInterval(86400)))
    }
    func testBackgroundDoesNotCountAsGameplayAndNewSessionHasGrace() {
        let now = Date(); let policy = AdPolicy(defaults: store)
        play(policy); policy.background(now: now)
        policy.foreground(now: now.addingTimeInterval(1800))
        XCTAssertFalse(policy.canShowForced(now: now.addingTimeInterval(1800)))
        play(policy, seconds: 89, activities: 0); XCTAssertFalse(policy.canShowForced(now: now))
        policy.advance(1); XCTAssertTrue(policy.canShowForced(now: now))
    }
    func testClockRollbackDoesNotEraseImpressionCaps() {
        let now = Date(); let policy = AdPolicy(defaults: store)
        for _ in 0..<3 { policy.fullscreenStarted(forced: true, now: now) }
        play(policy)
        XCTAssertFalse(policy.canShowForced(now: now.addingTimeInterval(-86400)))
    }
    func testAbortedOpportunityDoesNotRestartCooldown() {
        let policy = AdPolicy(defaults: store); let now = Date()
        play(policy)
        XCTAssertTrue(policy.canShowForced(now: now))
        policy.fullscreenEnded(wasPresented: false)
        XCTAssertTrue(policy.canShowForced(now: now), "A skipped boundary must not restart the ad cooldown")
        policy.fullscreenStarted(forced: true, now: now)
        policy.fullscreenEnded()
        XCTAssertFalse(policy.canShowForced(now: now))
    }
    func testKillSwitchAndInvalidTimeFailClosed() {
        let policy = AdPolicy(defaults: store); let now = Date()
        policy.advance(10000); policy.advance(.infinity); policy.advance(-1)
        XCTAssertEqual(policy.state.played, 0)
        play(policy); policy.rules.enabled = false
        XCTAssertFalse(policy.canShowForced(now: now)); XCTAssertFalse(policy.canOfferReward(now: now))
    }
}
