// indie-ads' native side on iOS (Runtime/IndieAdsNative.cs says what each call is for).
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <StoreKit/StoreKit.h>
#import <Network/Network.h>

extern UIViewController* UnityGetGLViewController(void);
extern void UnitySendMessage(const char* obj, const char* method, const char* msg);

static NSString* Str(const char* s) { return s ? [NSString stringWithUTF8String:s] : @""; }

// ---- the network: cellular, a personal hotspot, or Low Data Mode ----
// The monitor says what the network is a moment after it's started, not as it's started: so it is started as
// the game is (long before anyone asks), it's metered until the monitor says otherwise, and the first to ask
// waits for its first word, briefly, if it must. "Not metered" for want of knowing was megabytes of mobile
// data at every launch.
static nw_path_monitor_t gMonitor;
static BOOL gMetered = YES;
static dispatch_semaphore_t gPathSaid;

__attribute__((constructor)) static void StartMonitor(void)
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
@interface IndieAdsStoreSheet : NSObject <SKStoreProductViewControllerDelegate>
@property (nonatomic, strong) SKStoreProductViewController* sheet;
@property (nonatomic, copy) NSString* listener;
@end

static IndieAdsStoreSheet* gSheet;

static void Tell(NSString* listener, const char* how)
{
    if (listener.length) { UnitySendMessage(listener.UTF8String, "NativeStoreClosed", how); }
}

// `url`, then `fallback`, outside the game.
static void OpenOutside(NSString* url, NSString* fallback, NSString* listener)
{
    NSURL* first = url.length ? [NSURL URLWithString:url] : nil;
    NSURL* second = fallback.length ? [NSURL URLWithString:fallback] : nil;
    if (!first) { first = second; second = nil; }
    if (!first) { Tell(listener, "none"); return; }
    [UIApplication.sharedApplication openURL:first options:@{} completionHandler:^(BOOL opened) {
        if (!opened && second) { [UIApplication.sharedApplication openURL:second options:@{} completionHandler:nil]; }
        // The game hears of the return from the store by coming back to the front.
    }];
}

@implementation IndieAdsStoreSheet
- (void)productViewControllerDidFinish:(SKStoreProductViewController*)viewController
{
    [viewController dismissViewControllerAnimated:YES completion:nil];
    NSString* listener = self.listener;
    gSheet = nil;
    Tell(listener, "sheet");
}
@end

extern "C" {

bool _IndieAds_IsMetered(void)
{
    static BOOL waited = NO;
    if (!waited) { waited = YES; dispatch_semaphore_wait(gPathSaid, dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC)); }
    return gMetered;
}

bool _IndieAds_StoreSheetIsUp(void)
{
    return gSheet != nil;
}

// `id` (with `ct`, `pt`): the App Store sheet over the game; the listener is sent NativeStoreClosed when it's put
// away. Without an id, or if the sheet can't load the product: `url`, then `fallback`, outside the game.
void _IndieAds_OpenStore(const char* idC, const char* ctC, const char* ptC, const char* urlC, const char* fallbackC, const char* listenerC)
{
    NSString *itemId = Str(idC), *ct = Str(ctC), *pt = Str(ptC), *url = Str(urlC), *fallback = Str(fallbackC), *listener = Str(listenerC);
    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController* presenter = UnityGetGLViewController();
        while (presenter.presentedViewController) { presenter = presenter.presentedViewController; }
        if (!itemId.longLongValue || gSheet || !presenter) { OpenOutside(url, fallback, listener); return; }

        NSMutableDictionary* product = [@{ SKStoreProductParameterITunesItemIdentifier: @(itemId.longLongValue) } mutableCopy];
        if (ct.length) { product[SKStoreProductParameterCampaignToken] = ct; }
        if (pt.length) { product[SKStoreProductParameterProviderToken] = pt; }

        IndieAdsStoreSheet* holder = [IndieAdsStoreSheet new];
        holder.listener = listener;
        holder.sheet = [SKStoreProductViewController new];
        holder.sheet.delegate = holder;
        gSheet = holder;
        [holder.sheet loadProductWithParameters:product completionBlock:^(BOOL loaded, NSError* error) {
            if (loaded || gSheet != holder) { return; }
            // no such product, or no network: the sheet away, and the link the ordinary way
            gSheet = nil;
            [holder.sheet dismissViewControllerAnimated:YES completion:^{ OpenOutside(url, fallback, listener); }];
        }];
        [presenter presentViewController:holder.sheet animated:YES completion:nil];
    });
}

// `id` (with `ct`, `pt`): the App Store's banner for that game at the foot of the screen (SKOverlay, iOS 14 and
// up), over whatever the game is showing. No id: the banner away. Before iOS 14, nothing.
void _IndieAds_StoreBanner(const char* idC, const char* ctC, const char* ptC)
{
    NSString *itemId = Str(idC), *ct = Str(ctC), *pt = Str(ptC);
    dispatch_async(dispatch_get_main_queue(), ^{
        if (@available(iOS 14.0, *)) {
            UIWindowScene* scene = UnityGetGLViewController().view.window.windowScene;
            if (!scene) { return; }
            if (!itemId.longLongValue) { [SKOverlay dismissOverlayInScene:scene]; return; }
            SKOverlayAppConfiguration* config = [[SKOverlayAppConfiguration alloc] initWithAppIdentifier:itemId position:SKOverlayPositionBottom];
            if (ct.length) { config.campaignToken = ct; }
            if (pt.length) { config.providerToken = pt; }
            config.userDismissible = YES;
            [[[SKOverlay alloc] initWithConfiguration:config] presentInScene:scene];
        }
    });
}

}
