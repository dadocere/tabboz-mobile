import Foundation

struct AdRules {
    var enabled = true
    var firstGrace: TimeInterval = 300
    var sessionGrace: TimeInterval = 90
    var cooldown: TimeInterval = 240
    var activities = 5
    var halfHourCap = 3
    var dailyCap = 12
    var rewardSeconds: TimeInterval = 600
    var dailyRewardCap = 3
}

/// Persists counters across relaunch. Only the coordinator supplies foreground gameplay time.
final class AdPolicy {
    struct State: Codable {
        var played: TimeInterval = 0
        var sinceFullscreen: TimeInterval = 0
        var totalActivities = 0
        var sinceFullscreenActivities = 0
        var forced: [Date] = []
        var rewards: [Date] = []
        var rewardRemaining: TimeInterval = 0
        var earnedTokens: [String] = []
        var backgroundedAt: Date?
    }
    private let defaults: UserDefaults
    private let key = "ads.policy.v1"
    private(set) var state: State
    private(set) var sessionPlayed: TimeInterval = 0
    var rules = AdRules()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--reset-ad-policy-for-sdk-test") { defaults.removeObject(forKey: key) }
        #endif
        state = defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(State.self, from: $0) } ?? State()
    }
    func persist() {
        if let data = try? JSONEncoder().encode(state) { defaults.set(data, forKey: key) }
    }
    func advance(_ seconds: TimeInterval) {
        guard seconds.isFinite, seconds > 0, seconds <= 5 else { return }
        state.played += seconds
        state.sinceFullscreen += seconds
        sessionPlayed += seconds
        state.rewardRemaining = max(0, state.rewardRemaining - seconds)
    }
    func background(now: Date) { state.backgroundedAt = now; persist() }
    func foreground(now: Date) {
        if let date = state.backgroundedAt, now.timeIntervalSince(date) >= 1800 { sessionPlayed = 0 }
        state.backgroundedAt = nil
    }
    func completedActivity() {
        state.totalActivities += 1
        state.sinceFullscreenActivities += 1
        persist()
    }
    func canShowForced(now: Date) -> Bool {
        rules.enabled && state.played >= rules.firstGrace && sessionPlayed >= rules.sessionGrace &&
        state.totalActivities >= rules.activities && state.sinceFullscreenActivities >= rules.activities &&
        state.sinceFullscreen >= rules.cooldown && state.rewardRemaining <= 0 &&
        state.forced.filter { now.timeIntervalSince($0) < 1800 }.count < rules.halfHourCap &&
        state.forced.filter { now.timeIntervalSince($0) < 86400 }.count < rules.dailyCap
    }
    func canOfferReward(now: Date) -> Bool {
        rules.enabled && state.rewardRemaining <= 0 &&
        state.rewards.filter { now.timeIntervalSince($0) < 86400 }.count < rules.dailyRewardCap
    }
    func fullscreenStarted(forced: Bool, now: Date) {
        state.sinceFullscreen = 0
        state.sinceFullscreenActivities = 0
        if forced { state.forced.append(now) }
        state.forced.removeAll { now.timeIntervalSince($0) >= 86400 }
        persist()
    }
    func fullscreenEnded(wasPresented: Bool = true) {
        guard wasPresented else { return }
        state.sinceFullscreen = 0
        persist()
    }
    @discardableResult func earnReward(token: String, now: Date) -> Bool {
        guard !state.earnedTokens.contains(token) else { return false }
        state.earnedTokens.append(token)
        state.earnedTokens = Array(state.earnedTokens.suffix(32))
        state.rewardRemaining = max(state.rewardRemaining, rules.rewardSeconds)
        state.rewards.removeAll { now.timeIntervalSince($0) >= 86400 }
        state.rewards.append(now)
        persist()
        return true
    }
}
