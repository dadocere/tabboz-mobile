# Tabboz: free download funded by ads

Approved configuration implemented for iOS build 4, 10 November 2026. The user selected a free ads-funded model with moderate ad pressure, without purchases or subscriptions, preserving the educational membership fee waiver. The App Store draft price is now zero. The superseded paid proposal is archived in MONETIZATION-paid-proposal.md. No public app release has been performed.

Core implementation, identifiers, console status and test evidence are in [ADMOB.md](../Documentation/ADMOB.md). The native suite passed 20 tests and the separate real-SDK test passed its rewarded-ad/resume/persistence flow. The Tabboz consent message was published on 11 November 2026. The AdMob-to-Firebase reporting link was verified in both consoles the same day. Production app-readiness verification remains outstanding; test ads do not prove production revenue.

## Objective

Maximize revenue per acquired player over their first 7/30 days, subject to retention and stability constraints. Optimize sustained realized revenue, not clicks or eCPM alone. All timings below are product hypotheses, not industry-proven optimal values.

## Initial placement and caps

Use Google AdMob native iOS interstitial and rewarded formats; Android can reuse the policy later. Keep original art and gameplay economy intact.

| Rule | Starting value |
| --- | --- |
| First installation grace | 5 minutes of foreground gameplay AND 5 completed gameplay activities |
| Subsequent session grace | 90 seconds of foreground gameplay |
| Minimum forced-ad interval | 4 minutes of foreground gameplay since last full-screen ad dismissal |
| Minimum completed activities | 5 since the last full-screen ad; menu openings and taps do not count |
| Forced-ad caps | 3 per rolling 30 minutes and 12 per rolling 24 hours |
| Placement | Completed activity/dialog chain, after save, before the next playable interaction |
| Optional rewarded placement | User opens a single menu item: “Guarda un video: 10 minuti senza interruzioni pubblicitarie” |
| Reward | 10 minutes of foreground gameplay without forced ads; award once on SDK earned-reward callback; max 3 completed offers per rolling 24 hours |
| Reward stacking | Disabled while an ad-free period is active; restore unused time after relaunch |
| High-engagement ads | Disabled on standard AdMob units; audit third-party adapters separately |
| Other formats | No banners, app-open ads or rewarded interstitials initially |

Eligibility is an AND of all relevant rules. An eligible moment is not an instruction to interrupt active interaction. Inspect actual activity completion callbacks and modal state before implementing; DOM changes alone do not establish safe boundaries. Never show over quizzes, fights, typing, purchases, import/export, privacy screens, startup, resume or crash recovery. Do not present late if an ad finishes loading after the boundary has passed. Without a ready eligible ad, continue immediately; skip that opportunity rather than show a loading gate.

A returning session starts after at least 30 minutes in background. Relaunch does not clear caps or cooldown state. Only foreground gameplay advances grace/cooldown/reward timers; ad playback and menus do not count. Reward selection is voluntary, clearly discloses the benefit, and never conditions normal play or privacy choices on watching. Do not require clicking an ad. Rewarded viewing resets the ordinary full-screen cooldown too. Failed/cancelled rewarded ads grant no reward unless the SDK reports it was earned. Completing reward must survive callback duplication and relaunch.

For a first uninterrupted 15-minute session, the earliest forced opportunities could be near minute 5, 9 and 13; activities and safe-boundary requirements can delay or skip them. A short session can have zero. This is not a promise of impression volume.

The rewarded ad-free offer preserves the game's economy, but may cannibalize higher-value forced impressions. Test its net revenue before retaining it. Do not add currency, health, instant progress, daily streak penalties or lost-progress paywalls to manufacture ad demand.

## Revenue and retention optimization

Start with AdMob demand and automatic floor optimization rather than a guessed high eCPM floor that leaves slots empty. Compare realized revenue per eligible opportunity and match/show rates. Once there is usable volume, evaluate bidding partners with AdMob Mediation, one at a time, retaining only those with measurable revenue benefit and acceptable creative quality, latency, stability and privacy overhead. Higher eCPM does not necessarily imply higher total revenue. Do not promise fill or rates.

Use Firebase Remote Config for settings and an emergency ads-off switch with bundled conservative defaults; no fetching dependency may block gameplay. Run stable, randomized Firebase A/B assignments where analytics is permitted. Compare 6-minute versus 4-minute cooldowns, initially exposing a small fraction to the higher-pressure variant. Keep grace, placements and caps identical. Increase sample exposure only after smoke checks. Use the same start cohort, geography and observation windows; do not combine multiple untracked changes.

Primary objective: cumulative ad revenue per install at day 7, later day 30, across both formats. Also measure revenue per daily active user, D1/D7 retention, gameplay time excluding ads, post-ad session exits, crash-free users, interstitial opportunities/impressions, reward offer starts/completions and load/presentation failure. Ad-close app departures are proxies, not proof of causality. Stable randomized cohorts provide stronger evidence. Use impression-level paid callbacks and SDK currency/precision fields for analytics where permitted; reconcile against AdMob reporting. No names, save files or free-form input in events.

Proposed guardrail: do not roll out a higher-pressure configuration if D7 retention is credibly worse by more than 5% relative to control, even if short-term ad revenue rises. This threshold is a product choice and may be tightened after baseline data. Observe a full D7 window and adequate sample for the observed variance; do not choose a winner after a few days or prescribe a universal sample size. With low traffic, use conservative settings and wait instead of spreading users over many experiments. Respect telemetry opt-out; report measurement coverage because consenting users may not represent all users.

Preserve instant resume, local save/backup reliability, responsive original UI and clear first-play explanation. Track whether players return after their first successful game activities. Give players reasons to return through the existing game progression rather than extra forced notifications or ad popups.

## Implementation and launch requirements

1. Confirm AdMob publisher account and payout/legal entity. Firebase login alone is not AdMob enrollment. Production app ID and two ad unit IDs are needed; never invent them.
2. Add Google Mobile Ads and UMP via SwiftPM; collect required privacy choices before eligible requests. Keep a persistent privacy-options entry. Implement non-tracking requests initially; Firebase advertising-purpose consent remains denied deliberately; AdMob separately honors UMP and requests non-personalized ads. Do not assume UMP replaces Apple's ATT authorization if cross-app tracking is later introduced.
3. Native coordinator owns loading, display, caps, reward state and presentation callbacks. Bridge only allowlisted game lifecycle signals from WKWebView; save before display, pause audio/gameplay, restore afterward. Keep the original C engine artifacts unchanged if feasible.
4. Use official test ads and registered test devices during development. Test no fill, offline, consent denied/withdrawn, modal conflicts, rotation, backgrounding, repeated callbacks, reward persistence and cap persistence. No live-ad clicks for QA.
5. Host the publisher's genuine app-ads.txt on the existing developer website, confirm the store developer-site link, complete applicable AdMob app verification/readiness review and payout setup. Full production serving is not guaranteed immediately at launch.
6. Update hosted privacy policy, store disclosures, description and free pricing; create and validate a new build. Preserve unpublished/manual release until submission prerequisites are resolved. No Paid Apps Agreement or StoreKit is needed for ads-only revenue; existing game distribution-rights questions remain.

## Research sources

- [Google interstitial implementation and sample code](https://developers.google.com/admob/ios/interstitial): preloading, natural transitions, pause audio and no late display on load callback.
- [Recommended placements](https://support.google.com/admob/answer/6201350?hl=en) and [disallowed interstitials](https://support.google.com/admob/answer/6201362?hl=en-GB): avoid startup/exit, unexpected interruptions and excessive frequency.
- [High-engagement controls](https://support.google.com/admob/answer/15525707?hl=en): disabled standard AdMob interstitials have up to 5-second skip time versus 12 with setting enabled; does not control partner bidding units. No universal duration guarantee for all mediation sources.
- [Rewarded ads playbook](https://admob.google.com/home/resources/rewarded-ads-playbook/) and [reward policies](https://support.google.com/admob/answer/7313578?hl=en): optional valuable rewards and placement experiments. Vendor success stories are not forecasts for Tabboz.
- [Firebase ad-frequency experiment tutorial](https://firebase.google.com/docs/tutorials/optimize-ad-frequency): measure revenue and retention together.
- [AdMob mediation](https://developers.google.com/admob/ios/mediation) and [bidding setup/readiness](https://admob.google.com/home/bidding/how-to-set-up-bidding/).
- [UMP implementation](https://developers.google.com/admob/ios/privacy): refresh consent information, show required forms, honor canRequestAds and expose privacy options.
- [Apple fee-waiver rules](https://developer.apple.com/help/account/membership/fee-waivers/).
