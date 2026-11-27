// A game, as far as the SDK can tell: a view redrawn every frame (a colour going round, standing in for Metal or GL),
// with three buttons over it. Interstitial and More games are tapped on the main thread; Rewarded is shown from the
// game's own thread, as a game whose code is C++ would call it. The log under them is everything the SDK says.
//
// It runs in test mode against the live catalogue: every ad can be shown, and nothing is counted. Launched with
// `-autoplay interstitial|rewarded|more`, it taps that button itself once the catalogue is in.
#import <UIKit/UIKit.h>
#import "IndieAds.h"

static NSString* const kRewarded = @"FreeCoins";
static NSString* const kInterstitial = @"LevelEnd";

@interface GameViewController : UIViewController <IndieAdsDelegate>
@end

@implementation GameViewController {
    CADisplayLink* _frames;
    CGFloat _hue;
    BOOL _paused;
    dispatch_queue_t _gameThread;
    UILabel* _status;
    UITextView* _log;
    NSString* _autoplay;
}

- (void)viewDidLoad
{
    [super viewDidLoad];
    _gameThread = dispatch_queue_create("game", DISPATCH_QUEUE_SERIAL);
    _autoplay = [NSUserDefaults.standardUserDefaults stringForKey:@"autoplay"];
    [self buildScreen];
    _frames = [CADisplayLink displayLinkWithTarget:self selector:@selector(frame:)];
    [_frames addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];

    [IndieAds setDelegate:self];
    IndieAdsConfig* config = [IndieAdsConfig new];
    config.host = @"ios-sample";
    config.catalogueUrl = @"https://indieadnetwork.com/catalogue.json";
    IndieAdPlacement* rewarded = [IndieAdPlacement rewarded:kRewarded];
    rewarded.reward = @"100 coins";
    IndieAdPlacement* interstitial = [IndieAdPlacement interstitial:kInterstitial];
    interstitial.minSecs = 5;
    config.placements = @[rewarded, interstitial];
    config.test = YES;   // every ad can be shown, and nothing is sent to the ingest: never in a player's game
    config.log = YES;    // the console, "[IndieAds]"
    [IndieAds startWithViewController:self config:config];
    [self say:[NSString stringWithFormat:@"IndieAds %@ started", IndieAds.version]];
}

- (void)showInterstitial
{
    // Every tap is the network's here. A real game with a paid network calls [IndieAds showIfWanted:done:] instead, and
    // shows the paid network's ad when result.shown is NO.
    BOOL showing = [IndieAds show:kInterstitial done:^(IndieAdResult* result) {
        [self say:[NSString stringWithFormat:@"interstitial done: %@", result]];
    }];
    if (!showing) [self say:@"interstitial: nothing to show"];
}

- (void)showRewarded
{
    // From the game's own thread: the SDK takes it to the main thread, and calls back there.
    dispatch_async(_gameThread, ^{
        BOOL showing = [IndieAds show:kRewarded done:^(IndieAdResult* result) {
            [self say:result.granted ? @"rewarded: 100 coins earned" : [NSString stringWithFormat:@"rewarded done, no reward: %@", result]];
        }];
        if (!showing) [self say:@"rewarded: nothing to show"];
    });
}

- (void)showMoreGames
{
    if (![IndieAds showMoreGames:IndieAdsOpenInGame]) [self say:@"more games: no page yet"];
}

// ---- what the SDK says ----

- (void)indieAdsEvent:(IndieAdEvent*)event { [self say:event.description]; }
- (void)indieAdsShown { _paused = YES; [self say:@"indieAdsShown: the game pauses"]; }
- (void)indieAdsHidden { _paused = NO; [self say:@"indieAdsHidden: the game resumes"]; }

- (void)indieAdsDemandChanged
{
    IndieAdDemand *r = [IndieAds demandFor:kRewarded], *i = [IndieAds demandFor:kInterstitial];
    _status.text = [NSString stringWithFormat:@"rewarded: %@\ninterstitial: %@", r, i];
    if (_autoplay && r.available > 0 && i.available > 0) {
        NSString* which = _autoplay;
        _autoplay = nil;
        [self say:[NSString stringWithFormat:@"autoplay: %@", which]];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            if ([which isEqualToString:@"rewarded"]) [self showRewarded];
            else if ([which isEqualToString:@"more"]) [self showMoreGames];
            else [self showInterstitial];
        });
    }
}

// ---- the game ----

- (void)frame:(CADisplayLink*)link
{
    if (!_paused) _hue = fmod(_hue + link.duration * 0.08, 1);
    self.view.backgroundColor = [UIColor colorWithHue:_hue saturation:0.6 brightness:0.45 alpha:1];
}

- (BOOL)prefersStatusBarHidden { return YES; }
- (BOOL)prefersHomeIndicatorAutoHidden { return YES; }

- (void)buildScreen
{
    UIStackView* column = [UIStackView new];
    column.axis = UILayoutConstraintAxisVertical;
    column.alignment = UIStackViewAlignmentCenter;
    column.spacing = 12;
    column.translatesAutoresizingMaskIntoConstraints = NO;
    [column addArrangedSubview:[self button:@"Interstitial" action:@selector(showInterstitial)]];
    [column addArrangedSubview:[self button:@"Rewarded" action:@selector(showRewarded)]];
    [column addArrangedSubview:[self button:@"More games" action:@selector(showMoreGames)]];
    _status = [self label:14];
    _status.text = @"waiting for the catalogue…";
    [column addArrangedSubview:_status];
    [self.view addSubview:column];

    _log = [UITextView new];
    _log.editable = NO;
    _log.backgroundColor = UIColor.clearColor;
    _log.textColor = UIColor.whiteColor;
    _log.font = [UIFont systemFontOfSize:11];
    _log.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:_log];

    UILayoutGuide* safe = self.view.safeAreaLayoutGuide;
    [NSLayoutConstraint activateConstraints:@[
        [column.topAnchor constraintEqualToAnchor:safe.topAnchor constant:40],
        [column.leadingAnchor constraintEqualToAnchor:safe.leadingAnchor constant:24],
        [column.trailingAnchor constraintEqualToAnchor:safe.trailingAnchor constant:-24],
        [_log.topAnchor constraintEqualToAnchor:column.bottomAnchor constant:12],
        [_log.leadingAnchor constraintEqualToAnchor:column.leadingAnchor],
        [_log.trailingAnchor constraintEqualToAnchor:column.trailingAnchor],
        [_log.bottomAnchor constraintEqualToAnchor:safe.bottomAnchor],
    ]];
}

- (UIButton*)button:(NSString*)title action:(SEL)action
{
    UIButton* b = [UIButton buttonWithType:UIButtonTypeSystem];
    [b setTitle:title forState:UIControlStateNormal];
    [b setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    b.titleLabel.font = [UIFont systemFontOfSize:20 weight:UIFontWeightSemibold];
    b.backgroundColor = [UIColor colorWithWhite:0.15 alpha:0.85];
    b.layer.cornerRadius = 12;
    [b addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    [b.widthAnchor constraintEqualToConstant:240].active = YES;
    [b.heightAnchor constraintEqualToConstant:56].active = YES;
    return b;
}

- (UILabel*)label:(CGFloat)size
{
    UILabel* l = [UILabel new];
    l.numberOfLines = 0;
    l.textColor = UIColor.whiteColor;
    l.font = [UIFont systemFontOfSize:size];
    return l;
}

// From any thread: on the screen and on the console.
- (void)say:(NSString*)line
{
    printf("[IndieAdsSample] %s\n", line.UTF8String);
    fflush(stdout);
    dispatch_async(dispatch_get_main_queue(), ^{
        self->_log.text = [NSString stringWithFormat:@"%@\n%@", line, self->_log.text ?: @""];
    });
}

@end
