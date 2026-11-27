// What the device is asked, on the page's behalf: the Unity package's Plugins/iOS/IndieAdsNative.mm, without Unity.
// What else is on the device is never asked: a game's daily cap and its rest are what spare a player who has it.
#import <StoreKit/StoreKit.h>
#import <Network/Network.h>
#import "IndieAdsPrivate.h"

// ---- the network: cellular, a personal hotspot, or Low Data Mode ----
// The monitor says what the network is a moment after it's started, not as it's started: so it is started as the game
// is (long before anyone asks), it's metered until the monitor says otherwise, and the first to ask waits for its first
// word, briefly, if it must. "Not metered" for want of knowing was megabytes of mobile data at every launch.
static nw_path_monitor_t gMonitor;
static volatile BOOL gMetered = YES;
static dispatch_semaphore_t gPathSaid;

__attribute__((constructor)) static void IAStartMonitor(void)
{
    gPathSaid = dispatch_semaphore_create(0);
    gMonitor = nw_path_monitor_create();
    nw_path_monitor_set_queue(gMonitor, dispatch_get_global_queue(QOS_CLASS_UTILITY, 0));
    nw_path_monitor_set_update_handler(gMonitor, ^(nw_path_t path) {
        gMetered = nw_path_is_expensive(path) || nw_path_is_constrained(path);
        dispatch_semaphore_signal(gPathSaid);
    });
    nw_path_monitor_start(gMonitor);
}

// ---- the App Store sheet ----
@interface IAStoreSheet : NSObject <SKStoreProductViewControllerDelegate>
@property (nonatomic, strong) SKStoreProductViewController* sheet;
@property (nonatomic, copy) void (^closed)(void);
@end

static IAStoreSheet* gSheet;   // main thread

@implementation IAStoreSheet
- (void)productViewControllerDidFinish:(SKStoreProductViewController*)viewController
{
    if (gSheet != self) return;
    [viewController dismissViewControllerAnimated:YES completion:nil];
    gSheet = nil;
    if (self.closed) self.closed();
}
@end

@implementation IADevice

+ (BOOL)isMetered
{
    static BOOL waited = NO;
    if (!waited) {
        waited = YES;
        dispatch_semaphore_wait(gPathSaid, dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC));
    }
    return gMetered;
}

// IABTCF_gdprApplies is 1 where the law asks for consent; IABTCF_PurposeConsents has a character a purpose, "1" first
// where storing on the device is agreed. → @YES (agreed, or needn't be asked), @NO, or nil: no platform has said.
+ (NSNumber*)cmpConsent
{
    NSUserDefaults* kept = NSUserDefaults.standardUserDefaults;
    id applies = [kept objectForKey:@"IABTCF_gdprApplies"];
    if (![applies respondsToSelector:@selector(integerValue)]) return nil;   // unsaid, or kept as something else than the framework says
    id purposes = [kept objectForKey:@"IABTCF_PurposeConsents"];
    BOOL agreed = [applies integerValue] == 0 || ([purposes isKindOfClass:NSString.class] && [purposes hasPrefix:@"1"]);
    return @(agreed);
}

+ (void)openOutside:(NSString*)url fallback:(NSString*)fallback
{
    NSURL* first = url.length ? [NSURL URLWithString:url] : nil;
    NSURL* second = fallback.length ? [NSURL URLWithString:fallback] : nil;
    if (!first) { first = second; second = nil; }
    if (!first) return;
    [UIApplication.sharedApplication openURL:first options:@{} completionHandler:^(BOOL opened) {
        if (!opened && second) [UIApplication.sharedApplication openURL:second options:@{} completionHandler:nil];
    }];
}

+ (BOOL)storeSheetIsUp
{
    return gSheet != nil;
}

+ (void)openStore:(NSString*)itemId ct:(NSString*)ct pt:(NSString*)pt url:(NSString*)url fallback:(NSString*)fallback
        presenter:(UIViewController*)presenter closed:(void (^)(void))closed
{
    while (presenter.presentedViewController) presenter = presenter.presentedViewController;
    if (!itemId.longLongValue || gSheet || !presenter) {
        [self openOutside:url fallback:fallback];
        return;
    }
    NSMutableDictionary* product = [@{ SKStoreProductParameterITunesItemIdentifier: @(itemId.longLongValue) } mutableCopy];
    if (ct.length) product[SKStoreProductParameterCampaignToken] = ct;
    if (pt.length) product[SKStoreProductParameterProviderToken] = pt;

    IAStoreSheet* holder = [IAStoreSheet new];
    holder.closed = closed;
    holder.sheet = [SKStoreProductViewController new];
    holder.sheet.delegate = holder;
    gSheet = holder;
    [holder.sheet loadProductWithParameters:product completionBlock:^(BOOL loaded, NSError* error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (loaded || gSheet != holder) return;
            // no such product, or no network: the sheet away, and the link the ordinary way
            [holder.sheet dismissViewControllerAnimated:YES completion:^{
                if (gSheet != holder) return;   // closed while it was going
                gSheet = nil;
                [IADevice openOutside:url fallback:fallback];
            }];
        });
    }];
    [presenter presentViewController:holder.sheet animated:YES completion:nil];
}

+ (void)closeStore
{
    IAStoreSheet* holder = gSheet;
    if (!holder) return;
    gSheet = nil;
    holder.sheet.delegate = nil;
    [holder.sheet dismissViewControllerAnimated:NO completion:nil];
}

+ (void)storeBanner:(NSString*)itemId ct:(NSString*)ct pt:(NSString*)pt inView:(UIView*)view
{
    if (@available(iOS 14.0, *)) {
        UIWindowScene* scene = view.window.windowScene;
        if (!scene) return;
        if (!itemId.longLongValue) {
            [SKOverlay dismissOverlayInScene:scene];
            return;
        }
        SKOverlayAppConfiguration* config = [[SKOverlayAppConfiguration alloc] initWithAppIdentifier:itemId position:SKOverlayPositionBottom];
        if (ct.length) config.campaignToken = ct;
        if (pt.length) config.providerToken = pt;
        config.userDismissible = YES;
        [[[SKOverlay alloc] initWithConfiguration:config] presentInScene:scene];
    }
}

@end
