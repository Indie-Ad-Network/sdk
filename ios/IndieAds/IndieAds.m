// The Unity package's IndieAds.cs in Objective-C (android/'s IndieAds.java is the same in Java): what the page is told,
// and what's done with what it says. IndieAds.h says what each call is for.
#import <QuartzCore/QuartzCore.h>
#import "IndieAdsPrivate.h"

static NSString* const kVersion = @"0.6.23";

#define IALog(...) do { if (self.config.log) NSLog(@"[IndieAds] " __VA_ARGS__); } while (0)

// ---- the values a game is given and gives ----

@implementation IndieAdPlacement

- (instancetype)init
{
    if ((self = [super init])) {
        _placementId = @"";
        _maxSecs = 30;
        _minSecs = -1;
        _skipAfter = 5;
    }
    return self;
}

+ (instancetype)rewarded:(NSString*)placementId
{
    IndieAdPlacement* p = [self new];
    p.placementId = placementId;
    p.format = IndieAdFormatRewarded;
    return p;
}

+ (instancetype)interstitial:(NSString*)placementId
{
    IndieAdPlacement* p = [self rewarded:placementId];
    p.format = IndieAdFormatInterstitial;
    return p;
}

- (id)copyWithZone:(NSZone*)zone
{
    IndieAdPlacement* p = [IndieAdPlacement new];
    p.placementId = self.placementId;
    p.format = self.format;
    p.maxSecs = self.maxSecs;
    p.minSecs = self.minSecs;
    p.skipAfter = self.skipAfter;
    p.reward = self.reward;
    return p;
}

@end

@implementation IndieAdsConfig

- (instancetype)init
{
    if ((self = [super init])) {
        _host = @"";
        _catalogueUrl = @"";
        _placements = @[];
        _keepWebView = YES;
        _refreshAfterSeconds = 600;
        _showTimeout = 6;
        _consent = YES;
    }
    return self;
}

- (id)copyWithZone:(NSZone*)zone
{
    IndieAdsConfig* c = [IndieAdsConfig new];
    c.host = self.host;
    c.rating = self.rating;
    c.catalogueUrl = self.catalogueUrl;
    c.shippedCatalogueJson = self.shippedCatalogueJson;
    c.ingestUrl = self.ingestUrl;
    c.reportUrl = self.reportUrl;
    c.mixUrl = self.mixUrl;
    c.catalogueKey = self.catalogueKey;
    c.placements = [[NSArray alloc] initWithArray:self.placements copyItems:YES];
    c.muted = self.muted;
    c.language = self.language;
    c.age = self.age;
    c.keepWebView = self.keepWebView;
    c.refreshAfterSeconds = self.refreshAfterSeconds;
    c.showTimeout = self.showTimeout;
    c.consent = self.consent;
    c.test = self.test;
    c.log = self.log;
    return c;
}

@end

@interface IndieAdDemand ()
@property (nonatomic, readwrite) double share;
@property (nonatomic, readwrite) NSInteger available;
@end

@implementation IndieAdDemand
- (NSString*)description { return [NSString stringWithFormat:@"%ld available, share %g", (long)self.available, self.share]; }
@end

@interface IndieAdResult ()
@property (nonatomic, readwrite) BOOL shown, granted;
@property (nonatomic, readwrite, copy, nullable) NSString *creative, *app, *kind;
@property (nonatomic, readwrite) double watchedSecs;
+ (instancetype)ended:(BOOL)shown;
@end

@implementation IndieAdResult
+ (instancetype)ended:(BOOL)shown
{
    IndieAdResult* r = [self new];
    r.shown = shown;
    return r;
}
- (NSString*)description
{
    return [NSString stringWithFormat:@"shown=%d granted=%d creative=%@ app=%@ kind=%@ watchedSecs=%g", self.shown, self.granted, self.creative, self.app, self.kind, self.watchedSecs];
}
@end

@interface IndieAdEvent ()
@property (nonatomic, readwrite, copy, nullable) NSString *event, *placement, *creative, *app, *kind, *why, *via, *step;
@property (nonatomic, readwrite) double secs;
@end

@implementation IndieAdEvent
- (NSString*)description
{
    NSMutableString* s = [NSMutableString stringWithString:self.event ?: @"?"];
    NSDictionary* fields = @{ @"placement": self.placement ?: @"", @"creative": self.creative ?: @"", @"app": self.app ?: @"", @"kind": self.kind ?: @"", @"why": self.why ?: @"", @"via": self.via ?: @"", @"step": self.step ?: @"" };
    for (NSString* name in @[@"placement", @"creative", @"app", @"kind", @"why", @"via", @"step"]) {
        if ([fields[name] length]) [s appendFormat:@" %@=%@", name, fields[name]];
    }
    if (self.secs) [s appendFormat:@" secs=%g", self.secs];
    return s;
}
@end

// ---- what's said to the page ----

@implementation IAWire

+ (NSString*)quote:(NSString*)s
{
    if (!s) return @"null";
    NSMutableString* quoted = [NSMutableString stringWithCapacity:s.length + 2];
    [quoted appendString:@"\""];
    for (NSUInteger i = 0; i < s.length; i++) {
        unichar c = [s characterAtIndex:i];
        if (c == '"' || c == '\\') {
            [quoted appendString:c == '"' ? @"\\\"" : @"\\\\"];
        } else if (c < ' ' || c == 0x2028 || c == 0x2029 || c == '<') {
            // end a line in JavaScript, though not in JSON; and '<': nothing here may end a script or start a tag
            [quoted appendFormat:@"\\u%04x", c];
        } else {
            CFStringAppendCharacters((__bridge CFMutableStringRef)quoted, &c, 1);   // a UTF-16 unit as it is: emoji are two
        }
    }
    [quoted appendString:@"\""];
    return quoted;
}

+ (NSString*)number:(double)d
{
    if (d == floor(d) && fabs(d) < 1e15) return [NSString stringWithFormat:@"%lld", (long long)d];
    return [NSString stringWithFormat:@"%.15g", d];
}

+ (NSString*)startConfig:(IndieAdsConfig*)config key:(NSString*)key language:(NSString*)language wide:(BOOL)wide
{
    NSString* shipped = config.shippedCatalogueJson;
    NSMutableString* json = [NSMutableString stringWithCapacity:256 + shipped.length];
    [json appendFormat:@"{\"key\":%@", [self quote:key]];
    [json appendFormat:@",\"lang\":%@", [self quote:language]];
    [json appendFormat:@",\"host\":%@", [self quote:config.host]];
    [json appendFormat:@",\"rating\":%@", [self quote:config.rating]];
    [json appendString:@",\"os\":\"ios\""];
    [json appendFormat:@",\"catalogue\":%@", [self quote:config.catalogueUrl]];
    [json appendFormat:@",\"ingest\":%@", [self quote:config.ingestUrl]];
    [json appendFormat:@",\"reports\":%@", [self quote:config.reportUrl]];
    [json appendFormat:@",\"mix\":%@", [self quote:config.mixUrl]];
    [json appendFormat:@",\"signedBy\":%@", [self quote:config.catalogueKey]];
    [json appendFormat:@",\"age\":%@", config.age > 0 ? [NSString stringWithFormat:@"%ld", (long)config.age] : @"null"];
    [json appendFormat:@",\"test\":%@", config.test ? @"true" : @"false"];
    [json appendFormat:@",\"consent\":%@", config.consent ? @"true" : @"false"];
    [json appendFormat:@",\"wide\":%@", wide ? @"true" : @"false"];   // the page can't see its own shape until it's shown
    [json appendString:@",\"placements\":{"];
    [config.placements enumerateObjectsUsingBlock:^(IndieAdPlacement* p, NSUInteger i, BOOL* stop) {
        BOOL interstitial = p.format == IndieAdFormatInterstitial;
        [json appendFormat:@"%@%@:{\"format\":%@", i > 0 ? @"," : @"", [self quote:p.placementId], interstitial ? @"\"interstitial\"" : @"\"rewarded\""];
        if (p.maxSecs > 0) [json appendFormat:@",\"maxSecs\":%ld", (long)p.maxSecs];
        if (p.minSecs >= 0) [json appendFormat:@",\"minSecs\":%@", [self number:p.minSecs]];
        if (interstitial) [json appendFormat:@",\"skipAfter\":%@", [self number:p.skipAfter]];
        if (p.reward.length) [json appendFormat:@",\"reward\":%@", [self quote:p.reward]];
        [json appendString:@"}"];
    }];
    // the shipped catalogue is JSON already, and JSON is JavaScript
    NSString* trimmed = [shipped stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    [json appendFormat:@"},\"shipped\":%@}", trimmed.length ? shipped : @"null"];
    return json;
}

+ (NSString*)origin:(NSString*)catalogueUrl
{
    return [NSURL URLWithString:@"/" relativeToURL:[NSURL URLWithString:catalogueUrl]].absoluteString ?: catalogueUrl;
}

@end

// ---- a session ----

// A page that's run this long without trouble starts the waits again from the shortest; one has this long to answer as
// the game comes back; and a page lost this soon after it came back (its word arriving late) was lost while it was away.
// With an ad up the page has longer to answer (a playable can keep its page busy), but it must: an ad page emptied while
// the game was away can't end its own ad, and the game would wait on it for good.
static const double kHealthySeconds = 60, kAnswerSeconds = 4, kShowingAnswerSeconds = 10, kBackSeconds = kAnswerSeconds + 2;
static const double kGamesPatience = 6;   // for the page of games to load and say it can be closed, before Safari has it
static const double kStorePatience = 3;   // for a store to take the game from the front, before the ad's clock goes on
static const double kTick = 0.25;
static NSString* const kGamesReady = @"indie-ads:games-ready";   // what that page says (the server's games.js)
static NSString* const kGamesClose = @"indie-ads:close";

@interface IndieAds () <IAWebViewListener>
@property (nonatomic, weak) UIViewController* viewController;
@property (nonatomic, strong) IndieAdsConfig* config;
@property (nonatomic, strong, nullable) IAWebView* view;
@property (nonatomic, strong, nullable) IAWebView* games;
@property (atomic, copy) NSDictionary<NSString*, IndieAdDemand*>* demand;   // replaced whole, so any thread may read it
@property (atomic, copy, nullable) NSString* moreGamesUrl;
@property (atomic) BOOL stopped, showing, showPending;
@end

@implementation IndieAds {
    BOOL _pageLoaded;
    NSString* _pageKey;   // made for each page and given only to it: a frame inside the page (a playable) can't post, but the key is kept as on Android
    NSMutableArray<NSString*>* _waitingCalls;
    BOOL _asked;          // the page has asked what it can't know: it's told again whenever that may have changed
    double _demandTime;
    double _remakeDelay;  // how long after the next page lost (or put away for memory) one is made again: doubled each time, to 10 minutes
    double _remakeAt;     // when that is (-1: none is to be)
    double _pageLoadedTime;
    BOOL _away;           // the game isn't at the front
    double _backTime;     // when it last came back to the front
    double _askedAliveAt; // back at the front, the page was asked if it's there: when (-1: no answer awaited)
    NSInteger _aliveAsk;  // that question's number: only 'alive' with it is an answer
    BOOL _aliveHeard;

    BOOL _remake;         // the page is to be made again once the ad that's up has closed: the player's consent changed
    BOOL _keptAwake;      // the screen was kept on for the ad (the game hadn't), and is let go as it closes
    BOOL _showStarted;
    NSInteger _showNumber;
    NSString* _showPlacement;
    double _showRequestedTime;
    void (^_showDone)(IndieAdResult*);

    NSString* _gamesUrl;
    BOOL _gamesReady;
    double _gamesAsked;

    BOOL _storeOpen;
    BOOL _storeLeftApp;
    double _storeOpenedTime;

    BOOL _ticking;
    NSMutableArray* _observers;
}

static IndieAds* gInstance;   // @synchronized (IndieAds.class)
static id<IndieAdsDelegate> gDelegate;
static NSString* gPlayerPage;   // the resource, read once (main thread)

+ (NSString*)version { return kVersion; }

+ (IndieAds*)instance
{
    @synchronized (self) { return gInstance; }
}

+ (id<IndieAdsDelegate>)delegate
{
    @synchronized (self) { return gDelegate; }
}

+ (void)setDelegate:(id<IndieAdsDelegate>)delegate
{
    @synchronized (self) { gDelegate = delegate; }
}

static void OnMain(dispatch_block_t work)
{
    if (NSThread.isMainThread) work();
    else dispatch_async(dispatch_get_main_queue(), work);
}

// `work` with the session that's running, on the main thread; none, nothing
+ (void)session:(void (^)(IndieAds* s))work
{
    OnMain(^{
        IndieAds* s = [IndieAds instance];
        if (s && !s.stopped) work(s);
    });
}

// ---- the game's side: any thread ----

+ (void)startWithViewController:(UIViewController*)viewController config:(IndieAdsConfig*)config
{
    NSParameterAssert(viewController && config.catalogueUrl.length);
    IndieAds* session;
    @synchronized (self) {
        if (gInstance) return;
        session = [[IndieAds alloc] initWithViewController:viewController config:[config copy]];
        gInstance = session;
    }
    OnMain(^{ [session start]; });
}

+ (void)shutdown
{
    IndieAds* previous;
    @synchronized (self) {
        previous = gInstance;
        if (!previous) return;
        gInstance = nil;
    }
    OnMain(^{ [previous stopSession]; });
}

+ (BOOL)isInitialised { return [self instance] != nil; }

+ (BOOL)isShowing
{
    IndieAds* s = [self instance];
    return s && (s.showing || s.showPending);
}

+ (IndieAdDemand*)demandFor:(NSString*)placement
{
    IndieAds* s = [self instance];
    IndieAdDemand* d = (s && !s.showing && !s.showPending) ? s.demand[placement] : nil;
    return d ?: [IndieAdDemand new];
}

+ (BOOL)wants:(NSString*)placement
{
    IndieAdDemand* d = [self demandFor:placement];
    return d.available > 0 && (double)arc4random() / ((double)UINT32_MAX + 1) < d.share;
}

+ (BOOL)show:(NSString*)placement done:(void (^)(IndieAdResult*))done
{
    return [self show:placement reward:nil done:done];
}

+ (BOOL)show:(NSString*)placement reward:(NSString*)reward done:(void (^)(IndieAdResult*))done
{
    IndieAds* s = [self instance];
    if (!s) return NO;
    if (NSThread.isMainThread) return !s.showPending && [s doShow:placement done:done reward:reward];
    // From another thread: the answer is the one the main thread will give, as far as it can be known here. Should it
    // turn out otherwise, `done` is told nothing was shown.
    @synchronized (s) {
        if (s.stopped || s.showing || s.showPending) return NO;
        s.showPending = YES;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        s.showPending = NO;
        if (![s doShow:placement done:done reward:reward] && done) done([IndieAdResult ended:NO]);
    });
    return YES;
}

+ (void)setTest:(BOOL)on
{
    [self session:^(IndieAds* s) {
        if (s.config.test == on) return;
        s.config.test = on;
        if (s.view) [s call:@"test" arguments:on ? @"true" : @"false"];
        else [s ensurePage];   // a page that's been put away starts again with the new setting
    }];
}

+ (void)setConsent:(BOOL)agreed
{
    [self session:^(IndieAds* s) {
        if (s.config.consent == agreed) return;
        s.config.consent = agreed;
        if (s.showing) s->_remake = YES;
        else [s remakePage];
    }];
}

+ (void)setMuted:(BOOL)muted
{
    [self session:^(IndieAds* s) { s.config.muted = muted; }];
}

+ (void)setLanguage:(NSString*)language
{
    [self session:^(IndieAds* s) { s.config.language = language; }];
}

+ (NSNumber*)cmpConsent
{
    return [IADevice cmpConsent];
}

+ (void)offered:(NSString*)placement
{
    [self session:^(IndieAds* s) {
        // a page that's been put away is made again to hear it: an offer unsaid is an opt-in rate too high
        if ([s ensurePage]) [s call:@"offered" arguments:[IAWire quote:placement]];
    }];
}

+ (NSString*)moreGamesUrl
{
    return [self instance].moreGamesUrl;
}

+ (BOOL)showMoreGames:(IndieAdsOpenIn)where
{
    IndieAds* s = [self instance];
    if (!s || s.showing || s.showPending || !s.moreGamesUrl) return NO;
    OnMain(^{
        NSString* url = s.moreGamesUrl;
        if (s.stopped || s.showing || !url) return;
        if (where != IndieAdsOpenInGame || ![s openGames:url]) [IADevice openOutside:url fallback:nil];
    });
    return YES;
}

+ (void)getInstallCampaign:(void (^)(NSString*))done
{
    if (done) dispatch_async(dispatch_get_main_queue(), ^{ done(nil); });
}

// ---- starting and stopping ----

- (instancetype)initWithViewController:(UIViewController*)viewController config:(IndieAdsConfig*)config
{
    if ((self = [super init])) {
        _viewController = viewController;
        _config = config;
        _demand = @{};
        _waitingCalls = [NSMutableArray new];
        _observers = [NSMutableArray new];
        _remakeDelay = 5;
        _remakeAt = -1;
        _pageLoadedTime = -1;
        _backTime = -1;
        _askedAliveAt = -1;
    }
    return self;
}

static double Now(void)
{
    return CACurrentMediaTime();
}

- (void)start
{
    if (self.stopped) return;
    if (!self.config.shippedCatalogueJson) {
        NSString* path = [NSBundle.mainBundle pathForResource:@"indie-ads-catalogue" ofType:@"json"];
        if (path) self.config.shippedCatalogueJson = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil];
    }
    // Unity's OnApplicationFocus and Application.lowMemory, for this SDK
    __weak IndieAds* weakSelf = self;
    NSNotificationCenter* centre = NSNotificationCenter.defaultCenter;
    [_observers addObject:[centre addObserverForName:UIApplicationWillResignActiveNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification* n) { [weakSelf front:NO]; }]];
    [_observers addObject:[centre addObserverForName:UIApplicationDidBecomeActiveNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification* n) { [weakSelf front:YES]; }]];
    [_observers addObject:[centre addObserverForName:UIApplicationDidReceiveMemoryWarningNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification* n) { [weakSelf lowMemory]; }]];
    [self ensurePage];
}

- (void)stopSession
{
    if (self.stopped) return;
    self.stopped = YES;
    @synchronized (IndieAds.class) {
        if (gInstance == self) gInstance = nil;   // a block may start the next session
    }
    _remake = NO;
    for (id observer in _observers) [NSNotificationCenter.defaultCenter removeObserver:observer];
    [_observers removeAllObjects];
    self.demand = @{};
    [self dropPage];
    [self closeGames];
    [IADevice closeStore];
    if (self.showing) [self finishShow:[IndieAdResult ended:_showStarted]];
}

// ---- the page ----

+ (NSString*)playerPage
{
    if (gPlayerPage) return gPlayerPage;
    // The app's own bundle (the SDK's files dragged in), the SDK's (a framework), or Swift Package Manager's
    NSMutableArray<NSBundle*>* bundles = [NSMutableArray arrayWithObjects:NSBundle.mainBundle, [NSBundle bundleForClass:self], nil];
#ifdef SWIFTPM_MODULE_BUNDLE
    [bundles addObject:SWIFTPM_MODULE_BUNDLE];
#endif
    for (NSBundle* bundle in bundles) {
        NSString* path = [bundle pathForResource:@"IndieAdsPlayer" ofType:@"html"];
        if (path) {
            gPlayerPage = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil];
            if (gPlayerPage) break;
        }
    }
    return gPlayerPage;
}

- (BOOL)ensurePage
{
    if (self.stopped) return NO;
    if (self.view) return YES;
    UIView* parent = self.viewController.view;
    NSString* page = [IndieAds playerPage];
    if (!parent || !page) {
        if (!page) IALog(@"the player page (IndieAdsPlayer.html) isn't in the app");
        return NO;
    }
    self.view = [[IAWebView alloc] initInView:parent listener:self inspectable:self.config.log];
    _pageLoaded = NO;
    _remakeAt = -1;
    _pageLoadedTime = -1;
    _askedAliveAt = -1;
    _asked = NO;   // a page is asked if it's there only once it has asked what it can't know: it's up by then
    _pageKey = [[NSUUID UUID].UUIDString stringByReplacingOccurrencesOfString:@"-" withString:@""].lowercaseString;
    [_waitingCalls removeAllObjects];
    // The catalogue's origin is the page's: its history, downloads and unsent analytics are kept under it.
    [self.view loadHtml:page baseUrl:[IAWire origin:self.config.catalogueUrl]];
    return YES;
}

- (void)remakePage
{
    [self forget];
    [self ensurePage];
}

// The page goes, and what it said is available goes with it: nothing is the house's until a page that's up says
// otherwise. (A page put away because it's idle, with keepWebView off, keeps its word instead: show makes it again.)
- (void)forget
{
    [self dropPage];
    BOOL had = self.demand.count > 0;
    self.demand = @{};
    if (had) [self tellDemandChanged];
}

- (void)dropPage
{
    IAWebView* previous = self.view;
    self.view = nil;
    _pageLoaded = NO;
    [_waitingCalls removeAllObjects];
    [previous setVisible:NO];
    [previous destroy];
}

- (void)call:(NSString*)function arguments:(NSString*)arguments
{
    NSString* js = [NSString stringWithFormat:@"indieAdsHost.%@(%@)", function, arguments];
    if (_pageLoaded) [self.view evaluate:js];
    else [_waitingCalls addObject:js];
}

// ---- what the web views say ----

- (void)webView:(IAWebView*)view said:(NSString*)message
{
    if (view == self.view) [self receive:message];
    else if (view == self.games) [self gamesSaid:message];
}

- (void)webViewLost:(IAWebView*)view
{
    if (view == self.view) [self lose:@"lost"];
    else if (view == self.games) [self closeGames];
}

- (void)webView:(IAWebView*)view failed:(NSInteger)code message:(NSString*)message
{
    if (view == self.view) IALog(@"the player page failed: %ld %@", (long)code, message);
    else if (view == self.games) [self gamesFailed];
}

static NSString* Text(NSDictionary* o, NSString* name)
{
    id v = [o isKindOfClass:NSDictionary.class] ? o[name] : nil;
    return [v isKindOfClass:NSString.class] ? v : nil;
}

static double Number(NSDictionary* o, NSString* name)
{
    id v = [o isKindOfClass:NSDictionary.class] ? o[name] : nil;
    return [v isKindOfClass:NSNumber.class] ? [v doubleValue] : 0;
}

- (void)receive:(NSString*)json
{
    if (self.stopped) return;
    NSDictionary* batch = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
    if (![batch isKindOfClass:NSDictionary.class]) {
        IALog(@"unreadable message");
        return;
    }
    NSArray* items = batch[@"items"];
    if (![items isKindOfClass:NSArray.class]) return;
    NSString* k = Text(batch, @"k") ?: @"";
    for (NSDictionary* m in items) {
        if (self.stopped) break;
        if (![m isKindOfClass:NSDictionary.class]) continue;
        NSString* type = Text(m, @"type") ?: @"";
        // Before start() the page has no key, and all it says is that it's there.
        BOOL first = !_pageLoaded && [type isEqualToString:@"loaded"];
        if (first || (_pageLoaded && [k isEqualToString:_pageKey])) [self handle:type message:m];
    }
    [self tickSoon];
}

- (void)handle:(NSString*)type message:(NSDictionary*)m
{
    if (![type isEqualToString:@"event"]) IALog(@"%@", type);
    if ([type isEqualToString:@"loaded"]) {
        if (_pageLoaded) return;
        _pageLoaded = YES;
        _pageLoadedTime = Now();
        [self.view evaluate:[NSString stringWithFormat:@"indieAdsHost.start(%@)", [IAWire startConfig:self.config key:_pageKey language:self.config.language wide:[self isWide]]]];
        for (NSString* js in _waitingCalls) [self.view evaluate:js];
        [_waitingCalls removeAllObjects];
    } else if ([type isEqualToString:@"device"]) {
        _asked = YES;
        [self tellDevice:0];
    } else if ([type isEqualToString:@"alive"]) {
        if ((NSInteger)Number(m, @"n") == _aliveAsk) _aliveHeard = YES;
    } else if ([type isEqualToString:@"demand"]) {
        NSMutableDictionary* now = [NSMutableDictionary new];
        NSArray* rows = m[@"demand"];
        for (NSDictionary* row in [rows isKindOfClass:NSArray.class] ? rows : @[]) {
            NSString* placement = Text(row, @"placement");
            if (!placement) continue;
            IndieAdDemand* d = [IndieAdDemand new];
            d.share = Number(row, @"share");
            d.available = (NSInteger)Number(row, @"available");
            now[placement] = d;
        }
        self.demand = now;
        _demandTime = Now();
        [self tellDemandChanged];
    } else if ([type isEqualToString:@"event"]) {
        NSDictionary* e = m[@"e"];
        IndieAdEvent* event = [IndieAdEvent new];
        event.event = Text(e, @"event");
        event.placement = Text(e, @"placement");
        event.creative = Text(e, @"creative");
        event.app = Text(e, @"app");
        event.kind = Text(e, @"kind");
        event.why = Text(e, @"why");
        event.via = Text(e, @"via");
        event.step = Text(e, @"step");
        event.secs = Number(e, @"secs");
        IALog(@"%@", event);
        BOOL shownNow = self.showing && !_showStarted && [event.event isEqualToString:@"show"];
        if (shownNow) _showStarted = YES;
        [self tellEvent:event];
        if (shownNow && !self.stopped) {
            id<IndieAdsDelegate> d = [IndieAds delegate];
            if ([d respondsToSelector:@selector(indieAdsShown)]) [d indieAdsShown];
        }
    } else if ([type isEqualToString:@"store"]) {
        [self openStore:m[@"link"]];
    } else if ([type isEqualToString:@"more"]) {
        NSString* url = Text(m[@"link"], @"url");
        self.moreGamesUrl = url.length ? url : nil;
    } else if ([type isEqualToString:@"banner"]) {
        NSDictionary* link = m[@"link"];
        if (self.showing && [link isKindOfClass:NSDictionary.class] && self.viewController.view) {
            [IADevice storeBanner:Text(link, @"id") ?: @"" ct:Text(link, @"ct") ?: @"" pt:Text(link, @"pt") ?: @"" inView:self.viewController.view];
        }
    } else if ([type isEqualToString:@"done"]) {
        if (self.showing && (NSInteger)Number(m, @"n") == _showNumber) {
            IndieAdResult* r = [IndieAdResult new];
            r.shown = [m[@"shown"] boolValue];
            r.granted = [m[@"granted"] boolValue];
            r.creative = Text(m, @"creative");
            r.app = Text(m, @"app");
            r.kind = Text(m, @"kind");
            r.watchedSecs = Number(m, @"watchedSecs");
            [self finishShow:r];
        }
    } else if ([type isEqualToString:@"idle"]) {
        // without the player's consent what's been shown is remembered in the page alone, so the page is kept
        if (!self.showing && !self.config.keepWebView && self.config.consent) [self dropPage];
    }
}

// the game's screen is wider than tall: the page can't see its own shape until it's shown
- (BOOL)isWide
{
    CGSize size = self.viewController.view.bounds.size;
    if (size.width <= 0 || size.height <= 0) size = UIScreen.mainScreen.bounds.size;
    return size.width > size.height;
}

// ---- what a page can't know ----

// YES: the page was told. `ask`: a question's number, which it says back at once ('alive'), before anything else.
- (BOOL)tellDevice:(NSInteger)ask
{
    if (!self.view || !_asked || !_pageLoaded) return NO;
    NSString* metered = [IADevice isMetered] ? @"true" : @"false";
    [self call:@"device" arguments:[NSString stringWithFormat:@"{\"metered\":%@%@}", metered, ask > 0 ? [NSString stringWithFormat:@",\"ask\":%ld", (long)ask] : @""]];
    return YES;
}

- (void)front:(BOOL)front
{
    if (_storeOpen) {
        if (!front) _storeLeftApp = YES;
        else if (_storeLeftApp) [self storeClosed];
    }
    if (self.stopped) return;
    _away = !front;
    if (_away) {
        _askedAliveAt = -1;   // asked again on the way back: a page that hadn't the chance to answer isn't taken for lost
        return;
    }
    _backTime = Now();
    // Back at the front: the network may have changed, and a day-old cap may have lapsed. A page that's up is told, and
    // must answer: one the system emptied in the background without a word is lost all the same (tick).
    if (self.view) {
        _aliveHeard = NO;
        if ([self tellDevice:++_aliveAsk]) _askedAliveAt = _backTime;
    } else if (_remakeAt >= 0 || Now() - _demandTime > self.config.refreshAfterSeconds) {
        [self ensurePage];   // one lost, or put away for memory, while the game was away is made again now, not on its timer
    }
    [self tickSoon];
}

// ---- showing ----

- (BOOL)doShow:(NSString*)placement done:(void (^)(IndieAdResult*))done reward:(NSString*)reward
{
    if (self.showing || ![self ensurePage]) return NO;
    self.showing = YES;
    _showStarted = NO;
    _showDone = [done copy];
    _showPlacement = [placement copy];
    // The screen stays on for as long as an ad is up: nobody touches a video, or a playable's opening, for longer than a
    // phone waits before it dims, and a web view's page can't ask this of the device itself.
    _keptAwake = !UIApplication.sharedApplication.idleTimerDisabled;
    if (_keptAwake) UIApplication.sharedApplication.idleTimerDisabled = YES;
    _showRequestedTime = Now();
    ++_showNumber;
    [self.view setVisible:YES];
    [self call:@"show" arguments:[NSString stringWithFormat:@"%ld,%@,%@,%@,%@", (long)_showNumber, [IAWire quote:placement], [IAWire quote:reward],
                                  self.config.muted ? @"true" : @"false", [IAWire quote:self.config.language]]];
    [self tickSoon];
    return YES;
}

- (void)finishShow:(IndieAdResult*)result
{
    BOOL wasShown = _showStarted;
    if (_keptAwake) {
        UIApplication.sharedApplication.idleTimerDisabled = NO;
        _keptAwake = NO;
    }
    self.showing = NO;
    _showStarted = NO;
    _storeOpen = NO;
    if (self.viewController.view) [IADevice storeBanner:@"" ct:@"" pt:@"" inView:self.viewController.view];   // the page takes it away as it closes; this is for one that never said
    [self.view setVisible:NO];
    void (^done)(IndieAdResult*) = _showDone;
    _showDone = nil;
    if (wasShown) {
        id<IndieAdsDelegate> d = [IndieAds delegate];
        if ([d respondsToSelector:@selector(indieAdsHidden)]) [d indieAdsHidden];
    }
    if (_remake && !self.stopped) {   // the player's consent changed while the ad was up
        _remake = NO;
        [self remakePage];
    }
    if (done) done(result);
}

// ---- the clock: Unity's Update, for what's waited on ----

- (BOOL)waiting
{
    return _askedAliveAt >= 0 || _remakeAt >= 0 || (self.games && !_gamesReady) || (self.showing && !_showStarted) || (_storeOpen && !_storeLeftApp);
}

- (void)tickSoon
{
    if (_ticking || self.stopped || _away || ![self waiting]) return;
    _ticking = YES;
    __weak IndieAds* weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kTick * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ [weakSelf tick]; });
}

- (void)tick
{
    _ticking = NO;
    if (self.stopped || _away) return;   // the game away runs nothing of this, as Unity's player loop doesn't; front: starts it again
    [self update];
    [self tickSoon];
}

- (void)update
{
    double now = Now();
    // Asked if it was there as the game came back, and no answer: the system emptied it in the background
    if (_askedAliveAt >= 0 && now - _askedAliveAt > (self.showing ? kShowingAnswerSeconds : kAnswerSeconds)) {
        _askedAliveAt = -1;
        if (!_aliveHeard && self.view) {
            [self lose:@"unanswered"];
            if (self.stopped) return;
        }
    }
    // A page lost, or put away for memory, is made again (lose:, lowMemory)
    if (_remakeAt >= 0 && now >= _remakeAt) {
        _remakeAt = -1;
        if (!self.showing) [self ensurePage];
    }
    // A page of games that hasn't said it can be closed isn't put in front of the player: Safari has it
    if (self.games && !_gamesReady && now - _gamesAsked > kGamesPatience) [self gamesFailed];
    if (self.showing && !_showStarted && now - _showRequestedTime > self.config.showTimeout) {
        IALog(@"the ad never started: giving up on it");
        [self forget];   // a page that couldn't start an ad: its word goes with it, and one is made again later
        [self scheduleRemake:[self lostWhileAway]];
        [self finishShow:[IndieAdResult ended:NO]];
    }
    // A store that never took the game from the front (nothing opened): don't leave the ad's clock standing.
    if (_storeOpen && !_storeLeftApp && ![IADevice storeSheetIsUp] && now - _storeOpenedTime > kStorePatience) [self storeClosed];
}

// ---- the page of more games, in a web view of the game's own ----

- (BOOL)openGames:(NSString*)url
{
    [self closeGames];
    UIView* parent = self.viewController.view;
    if (!parent) return NO;
    self.games = [[IAWebView alloc] initInView:parent listener:self inspectable:self.config.log];
    _gamesUrl = url;
    _gamesReady = NO;
    _gamesAsked = Now();
    // as the server gives it to a game: a ✕, and links the stores' own apps take
    [self.games loadUrl:[url stringByAppendingString:[url containsString:@"?"] ? @"&in=app" : @"?in=app"]];
    [self tickSoon];
    return YES;
}

- (void)gamesSaid:(NSString*)said
{
    if (self.stopped) return;
    if ([said isEqualToString:kGamesReady] && self.games && !_gamesReady) {
        _gamesReady = YES;
        [self.games setVisible:YES];
    } else if ([said isEqualToString:kGamesClose]) {
        [self closeGames];
    }
}

// It wouldn't load, or never said it could be closed: not shown at all. Safari may do better, and is no worse.
- (void)gamesFailed
{
    if (self.stopped || !self.games || _gamesReady) return;
    NSString* url = _gamesUrl;
    [self closeGames];
    [IADevice openOutside:url fallback:nil];
}

- (void)closeGames
{
    IAWebView* previous = self.games;
    self.games = nil;
    _gamesUrl = nil;
    _gamesReady = NO;
    [previous setVisible:NO];
    [previous destroy];
}

// An ad that was up ends (shown, if it had started; no reward), with a fail of this `why` (see IndieAdEvent).
- (void)lose:(NSString*)why
{
    IALog(@"the web view was lost (%@)", why);
    BOOL wasShowing = self.showing;
    [self forget];   // what it said goes with it: a page that can't be made at all must claim nothing
    [self scheduleRemake:[why isEqualToString:@"unanswered"] || [self lostWhileAway]];   // silent as the game came back: emptied while away
    // unless the delegate (indieAdsDemandChanged, then indieAdsEvent) shut the SDK down, which finished it
    if (wasShowing && self.showing) {
        IndieAdEvent* event = [IndieAdEvent new];
        event.event = @"fail";
        event.why = why;
        event.placement = _showPlacement;
        [self tellEvent:event];
        if (self.showing) [self finishShow:[IndieAdResult ended:_showStarted]];
    }
    [self tickSoon];
}

// The system says memory is low: the page goes (it's tens of MB), unless an ad is up or, without consent, it's the only
// record of what's been shown. It's made again a little later.
- (void)lowMemory
{
    if (self.stopped || self.showing || !self.view || !self.config.consent) return;
    IALog(@"memory is low: the web view is put away");
    [self forget];
    [self scheduleRemake:NO];   // always after the wait: made again at once, it would take the memory straight back
    [self tickSoon];
}

// A page lost with the game away (iOS empties a web view in the background now and then), or so soon after it came back
// that word of it is late: made again as the game comes back, not on the timer.
- (BOOL)lostWhileAway
{
    return _away || (_backTime >= 0 && Now() - _backTime < kBackSeconds);
}

- (void)scheduleRemake:(BOOL)atOnce
{
    double now = Now();
    if (atOnce) {
        _remakeAt = now;
        return;
    }
    if (_pageLoadedTime >= 0 && now - _pageLoadedTime >= kHealthySeconds) _remakeDelay = 5;
    _pageLoadedTime = -1;
    _remakeAt = now + _remakeDelay;
    _remakeDelay = MIN(_remakeDelay * 2, 600);
}

// ---- the store ----

- (void)openStore:(NSDictionary*)link
{
    _storeOpen = YES;
    _storeLeftApp = NO;
    _storeOpenedTime = Now();
    UIViewController* presenter = self.viewController;
    __weak IndieAds* weakSelf = self;
    if (!presenter) {
        [IADevice openOutside:Text(link, @"url") fallback:Text(link, @"fallback")];
    } else {
        [IADevice openStore:Text(link, @"id") ?: @"" ct:Text(link, @"ct") ?: @"" pt:Text(link, @"pt") ?: @"" url:Text(link, @"url") ?: @""
                   fallback:Text(link, @"fallback") ?: @"" presenter:presenter closed:^{ [weakSelf storeClosed]; }];
    }
    [self tickSoon];
}

- (void)storeClosed
{
    if (!_storeOpen) return;
    _storeOpen = NO;
    if (self.view && _pageLoaded) [self.view evaluate:@"indieAdsHost.storeClosed()"];
}

// ---- the game's delegate ----

- (void)tellEvent:(IndieAdEvent*)event
{
    id<IndieAdsDelegate> d = [IndieAds delegate];
    if ([d respondsToSelector:@selector(indieAdsEvent:)]) [d indieAdsEvent:event];
}

- (void)tellDemandChanged
{
    id<IndieAdsDelegate> d = [IndieAds delegate];
    if ([d respondsToSelector:@selector(indieAdsDemandChanged)]) [d indieAdsDemandChanged];
}

@end
