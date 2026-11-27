// What IndieAds.m uses of the SDK's other files. Not for a game: IndieAds.h is its whole API.
#import <UIKit/UIKit.h>
#import "IndieAds.h"

NS_ASSUME_NONNULL_BEGIN

@class IAWebView;

/// What a web view says, on the main thread.
@protocol IAWebViewListener <NSObject>
/// The page itself said this (window.nativeWebView.postMessage): a frame inside it (an ad's playable) is never heard.
- (void)webView:(IAWebView*)view said:(NSString*)message;
/// The system ended the page's process (memory, or a crash of its own): this view is no more use.
- (void)webViewLost:(IAWebView*)view;
/// The main frame wouldn't load (an error, or an HTTP status that is one).
- (void)webView:(IAWebView*)view failed:(NSInteger)code message:(NSString*)message;
@end

/// A WKWebView over the whole of `parent`, hidden until it's shown. The Unity package's Plugins/iOS/NativeWebView.mm,
/// without Unity. Main thread only.
@interface IAWebView : NSObject
- (instancetype)initInView:(UIView*)parent listener:(id<IAWebViewListener>)listener inspectable:(BOOL)inspectable;
- (void)loadUrl:(NSString*)url;
/// The page is `html`, as if it had come from `baseUrl`: its storage is that origin's.
- (void)loadHtml:(NSString*)html baseUrl:(NSString*)baseUrl;
- (void)evaluate:(NSString*)javascript;
- (void)setVisible:(BOOL)visible;
- (void)destroy;
@end

/// What the device is asked, on the page's behalf. The Unity package's Plugins/iOS/IndieAdsNative.mm, without Unity.
@interface IADevice : NSObject
/// Cellular, a personal hotspot, or Low Data Mode: creatives aren't downloaded ahead on one.
+ (BOOL)isMetered;
/// @YES, @NO or nil, by the IAB framework's names in the standard user defaults.
+ (nullable NSNumber*)cmpConsent;
/// `itemId` (with `ct`, `pt`): the App Store sheet over `presenter`, and `closed` once it's put away. Without an id, or if
/// the sheet can't load the product: `url`, then `fallback`, outside the game (and `closed` never: the game hears of the
/// store by coming back to the front).
+ (void)openStore:(NSString*)itemId ct:(NSString*)ct pt:(NSString*)pt url:(NSString*)url fallback:(NSString*)fallback
        presenter:(UIViewController*)presenter closed:(void (^)(void))closed;
/// The App Store sheet is over the game: the game hasn't left the front, but the store is open.
+ (BOOL)storeSheetIsUp;
/// This session's sheet away, a product still loading too, without a word.
+ (void)closeStore;
/// The App Store's own banner for the game `itemId` at the foot of the screen (SKOverlay, iOS 14 on). Empty id: away.
+ (void)storeBanner:(NSString*)itemId ct:(NSString*)ct pt:(NSString*)pt inView:(UIView*)view;
/// `url`, then `fallback`, outside the game.
+ (void)openOutside:(nullable NSString*)url fallback:(nullable NSString*)fallback;
@end

/// What IndieAds says to the page (web/host.js), as text: as IndieAds.cs and android/'s Wire.java say it.
@interface IAWire : NSObject
/// `s` as a JavaScript string literal, or null.
+ (NSString*)quote:(nullable NSString*)s;
/// A number as JavaScript reads it: 2.5, 5.
+ (NSString*)number:(double)d;
/// The argument of indieAdsHost.start(). `wide`: the game's screen is wider than tall.
+ (NSString*)startConfig:(IndieAdsConfig*)config key:(NSString*)key language:(nullable NSString*)language wide:(BOOL)wide;
/// The origin of the catalogue's address, which is the page's: where its storage and downloads are kept.
+ (NSString*)origin:(NSString*)catalogueUrl;
@end

NS_ASSUME_NONNULL_END
