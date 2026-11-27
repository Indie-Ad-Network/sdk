// Indie Ad Network in a native iOS game: our own and our friends' games, as rewarded ads and interstitials, beside
// whatever paid network the game has.
//
//   [IndieAds startWithViewController:gameViewController config:config];   // at launch: fetches the catalogue, downloads a few creatives ahead
//   if ([IndieAds wants:@"FreeCoins"]) {                                     // this slot is the house's (demandFor: share and what's available)
//       [IndieAds show:@"FreeCoins" done:^(IndieAdResult* result) { if (result.granted) … }];
//   } else { …the paid network's }
//
// The share is the network's to say (the catalogue, or the ingest's /mix: what's owed between studios), and is 0 for a
// player there's nothing to show. So a game asks before every ad and falls back to its paid network on "no".
//
// The ads are the SDK's web player (IndieAdsPlayer.html: core/ in one page, the page the Unity package plays) in a
// WKWebView laid over the game's view. This is the Unity package's IndieAds.cs in Objective-C, as android/ is in Java.
//
// Every method may be called from any thread (a game's own, its render thread); the work is done on the main thread,
// and every block and delegate method is called there.
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, IndieAdFormat) {
    /// The player's choice; watching to the end of the countdown earns the game's reward.
    IndieAdFormatRewarded,
    /// The game's choice, between two things the player was doing: no reward, and a way out by the placement's minSecs.
    IndieAdFormatInterstitial,
};

/// Where showMoreGames: opens the page of more games.
typedef NS_ENUM(NSInteger, IndieAdsOpenIn) {
    /// Safari: the player leaves the game for it.
    IndieAdsOpenInBrowser,
    /// A web view over the game, closed by the page's own ✕.
    IndieAdsOpenInGame,
};

/// A place in the game where an ad may be shown, by the name the game and the dashboard call it.
@interface IndieAdPlacement : NSObject <NSCopying>
@property (nonatomic, copy) NSString* placementId;
@property (nonatomic) IndieAdFormat format;
/// The longest creative this placement takes, in seconds. 0 = any. 30 unless said.
@property (nonatomic) NSInteger maxSecs;
/// The least time this placement holds the player to an ad, in seconds. -1 (unless said) = unsaid. Interstitial: a video
/// offers Skip at that time (12 s at the latest), and ✕ is on its end card 3 s after Skip (unsaid: skipAfter; 15 at
/// most). Rewarded: the reward can be claimed from then (unsaid: the creative's own time). The dashboard can say another.
@property (nonatomic) double minSecs;
/// Interstitial: minSecs, as it was called before 0.6.3. Read where minSecs is unsaid. 5 unless said.
@property (nonatomic) double skipAfter;
/// Rewarded: what watching earns, as the player is told it ("Earned: …"). Nil = "Reward earned".
@property (nonatomic, copy, nullable) NSString* reward;

+ (instancetype)rewarded:(NSString*)placementId;
+ (instancetype)interstitial:(NSString*)placementId;
@end

/// What startWithViewController:config: is told. It's read at start: change test, consent, muted and language later through IndieAds.
@interface IndieAdsConfig : NSObject <NSCopying>
/// This game's id in the catalogue: it's never advertised to itself.
@property (nonatomic, copy) NSString* host;
/// This game's age rating ("4+", "9+"…): nothing rated above it is shown. Nil = anything.
@property (nonatomic, copy, nullable) NSString* rating;
/// The catalogue on the server. Its origin is also the page's: where its storage and downloads are kept.
@property (nonatomic, copy) NSString* catalogueUrl;
/// The catalogue that shipped with the game, as JSON text, for a first run with no server. Nil: the app's resource
/// indie-ads-catalogue.json, if it has one.
@property (nonatomic, copy, nullable) NSString* shippedCatalogueJson;
/// The SDK's own analytics endpoint, or nil for none.
@property (nonatomic, copy, nullable) NSString* ingestUrl;
/// Where a player's report of an ad is sent (the ingest's /flag), or nil for /flag beside ingestUrl.
@property (nonatomic, copy, nullable) NSString* reportUrl;
/// Where the share of this game's ad slots is asked (the ingest's /mix), or nil for the catalogue's own word.
@property (nonatomic, copy, nullable) NSString* mixUrl;
/// The network's public key, or nil for the one in the shipped catalogue. With a key the server's catalogue is used only
/// if the network signed it: someone between the player and the server can't serve ads of their own.
@property (nonatomic, copy, nullable) NSString* catalogueKey;
@property (nonatomic, copy) NSArray<IndieAdPlacement*>* placements;
/// Is the game muted? An ad starts silent if so. setMuted: changes it later.
@property (nonatomic) BOOL muted;
/// The language the player is playing in, if the game has a setting of its own: "fr", "es", "zh-Hant", "pt-BR". Nil: the
/// device's language. setLanguage: changes it later.
@property (nonatomic, copy, nullable) NSString* language;
/// The player's reported age, or 0 if not known. Under 13, only the games the network has marked as for them are shown.
@property (nonatomic) NSInteger age;
/// Keep the web view (tens of MB) between ads, as unless said: an ad then starts at once. It's put away all the same when
/// the system says memory is low, and made again a little later. NO: it's put away whenever the page is idle and made
/// again at show, which on a slow phone can be seconds before the ad appears.
@property (nonatomic) BOOL keepWebView;
/// With the web view put away, look again at what's available when the game comes back to the front after this long. 600 unless said.
@property (nonatomic) double refreshAfterSeconds;
/// Seconds for an ad to start before it's given up as failed. 6 unless said.
@property (nonatomic) double showTimeout;
/// Has the player agreed to anything being kept on their device? The UK and the EEA ask it for advertising. NO: nothing is
/// kept there. setConsent: changes it later; cmpConsent reads a consent platform's answer. YES unless said.
@property (nonatomic) BOOL consent;
/// A developer trying the ads out (setTest: changes it later): the game's own ads, games that are resting and creatives at
/// their daily cap all count, and nothing is sent to the ingest. Never on in a player's game.
@property (nonatomic) BOOL test;
/// Log to the console (NSLog, "[IndieAds]"): what the page says and its warnings. Off, the SDK logs nothing.
@property (nonatomic) BOOL log;
@end

/// What there is to show this player in a placement now, and what share of the game's slots the network asks for.
@interface IndieAdDemand : NSObject
/// 0–1. Already 0 when nothing is available.
@property (nonatomic, readonly) double share;
/// How many creatives this player could be shown here: 0 if they have every game, or have seen each as often as it may
/// be shown today, or none is downloaded yet.
@property (nonatomic, readonly) NSInteger available;
@end

/// How a showing went: show:'s block has it once the ad has closed, or failed to appear.
@interface IndieAdResult : NSObject
/// An ad was put in front of the player. NO: nothing happened, show another network's.
@property (nonatomic, readonly) BOOL shown;
/// Rewarded: watched to the end of the countdown. Always NO for an interstitial.
@property (nonatomic, readonly) BOOL granted;
@property (nonatomic, readonly, copy, nullable) NSString *creative, *app, *kind;
@property (nonatomic, readonly) double watchedSecs;
@end

/// An event of the player, for the game's own analytics: offer, show, q25…q100, first_touch, complete, reward, exit_kept,
/// exit_early, keep_playing, store_banner, store_open, cache_miss, fail; and step, a playable's own name (`step`) for
/// somewhere in it a showing reached. One fail is the SDK's own: an ad's web view went while it was up, `why` lost (the
/// system ended its process) or unanswered (silent as the game came back).
@interface IndieAdEvent : NSObject
@property (nonatomic, readonly, copy, nullable) NSString *event, *placement, *creative, *app, *kind, *why, *via, *step;
@property (nonatomic, readonly) double secs;
@end

/// What the SDK says of itself, for a game that wants to hear it. Main thread.
@protocol IndieAdsDelegate <NSObject>
@optional
/// Every event of the player, for the game's own analytics.
- (void)indieAdsEvent:(IndieAdEvent*)event;
/// An ad is on screen, whoever showed it: pause the game's music and sound here. Called once a showing.
- (void)indieAdsShown;
/// The ad indieAdsShown told of has closed, before show:'s block: resume the game's sound here. Not called for an ad that
/// never appeared, so a game only resumes what it paused.
- (void)indieAdsHidden;
/// What's available, or the share asked for, may have changed.
- (void)indieAdsDemandChanged;
@end

@interface IndieAds : NSObject

@property (class, nonatomic, readonly) NSString* version;

/// Says what happens, to a game that wants to hear it. Held strongly; kept across shutdown and start.
+ (void)setDelegate:(nullable id<IndieAdsDelegate>)delegate;

/// Starts the SDK over `viewController`'s view (the game's own, which the ads are laid over), at launch. Again while it's
/// running: nothing.
+ (void)startWithViewController:(UIViewController*)viewController config:(IndieAdsConfig*)config;

/// Stops this session before logout, opt-out or a change of player. An outstanding show completes once, with shown saying
/// whether it appeared and granted NO; indieAdsHidden comes before it if shown. Safe to call again; start may be called
/// afterwards. The delegate is kept; what's kept on the device isn't erased (setConsent: is for that).
+ (void)shutdown;

+ (BOOL)isInitialised;
+ (BOOL)isShowing;

/// What there is to show this player in `placement` now, as the page last said: always to hand, without waiting.
+ (IndieAdDemand*)demandFor:(NSString*)placement;

/// Should this slot be the house's? Rolls the share: call once per ad, when it's about to be shown.
+ (BOOL)wants:(NSString*)placement;

/// Shows an ad in `placement`. NO: nothing will be shown and `done` won't be called. Otherwise `done` is called once, on the
/// main thread, when the ad has closed (or failed to appear: result.shown NO).
+ (BOOL)show:(NSString*)placement done:(nullable void (^)(IndieAdResult* result))done;
/// `reward`: what watching earns, as the player is told it ("Earned: …"), for this showing; nil for the placement's.
+ (BOOL)show:(NSString*)placement reward:(nullable NSString*)reward done:(nullable void (^)(IndieAdResult* result))done;

/// Turns test mode (IndieAdsConfig.test) on or off. What's available changes with it: indieAdsDemandChanged says when it's in.
+ (void)setTest:(BOOL)on;
/// The player's answer on things being kept on their device (IndieAdsConfig.consent) has changed. The page is made again
/// with it, at once, or when the ad that's up has closed.
+ (void)setConsent:(BOOL)agreed;
/// Is the game muted? The next ad starts silent if so.
+ (void)setMuted:(BOOL)muted;
/// The language the player is playing in (IndieAdsConfig.language), from the next ad.
+ (void)setLanguage:(nullable NSString*)language;

/// What the game's consent platform (Google's, or any on the IAB's framework) has kept of the player's answer, in the
/// standard user defaults: @YES (agreed, or somewhere that needn't be asked), @NO (asked, and not agreed), or nil where no
/// platform has said, and the game must go by its own means.
+ (nullable NSNumber*)cmpConsent;

/// A placement's button was put in front of the player (once per time it's put there): shows over offers is the opt-in rate.
+ (void)offered:(NSString*)placement;

/// The network's page of the games this one shows the ads of (the page an ad's ⓘ leads to). Nil until the catalogue is in
/// (a moment after start), where the catalogue names no such page, and for a player under 13 (IndieAdsConfig.age).
+ (nullable NSString*)moreGamesUrl;

/// For a "More games" button of the game's own: opens that page, in Safari or in a web view over the game with a ✕ of its
/// own. NO: there's no page to open (moreGamesUrl is nil), or an ad is up. In the game's web view the page is shown only
/// once it says it can be closed; one that doesn't in a few seconds, or won't load, is handed to Safari.
+ (BOOL)showMoreGames:(IndieAdsOpenIn)where;

/// Android's install campaign: on iOS always nil (the App Store says nothing of where an install came from), on the main
/// thread. For a game that calls it on both.
+ (void)getInstallCampaign:(void (^)(NSString* _Nullable campaign))done;

@end

NS_ASSUME_NONNULL_END
