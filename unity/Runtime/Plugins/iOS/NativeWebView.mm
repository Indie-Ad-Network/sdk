// A web view laid over the Unity game: WKWebView, as a subview of the game's own view.
// Runtime/NativeWebView.cs is its Unity side and says what each call is for; what happens here
// is sent to the GameObject named `listener`.
//
// The page talks back with window.nativeWebView.postMessage(string). Only the page itself is
// heard: a frame inside it (an ad's playable) is not. Nor can a frame open another app.
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

extern UIViewController* UnityGetGLViewController(void);
extern void UnitySendMessage(const char* obj, const char* method, const char* msg);

static NSString* const kHandler = @"nativeWebView";
static NSString* const kBridge = @"window.nativeWebView={postMessage:function(s){window.webkit.messageHandlers.nativeWebView.postMessage(String(s));}};";

// WKUserContentController keeps its handler: a go-between that doesn't keep the web view, so it can be let go.
@interface HAWeakHandler : NSObject <WKScriptMessageHandler>
@property (nonatomic, weak) id<WKScriptMessageHandler> target;
@end
@implementation HAWeakHandler
- (void)userContentController:(WKUserContentController*)controller didReceiveScriptMessage:(WKScriptMessage*)message
{
    [self.target userContentController:controller didReceiveScriptMessage:message];
}
@end

@interface HANativeWebView : NSObject <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler>
@property (nonatomic, strong) WKWebView* webView;
@property (nonatomic, copy) NSString* listener;
@property (nonatomic) CGRect unit;   // where it is, as fractions of the game's view
@end

@implementation HANativeWebView

- (instancetype)initWithListener:(NSString*)listener
{
    if ((self = [super init]))
    {
        _listener = [listener copy];
        _unit = CGRectMake(0, 0, 1, 1);

        WKWebViewConfiguration* config = [WKWebViewConfiguration new];
        config.allowsInlineMediaPlayback = YES;                                     // in the page, not the system's full-screen player
        config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;   // the tap was on the game's own button
        HAWeakHandler* handler = [HAWeakHandler new];
        handler.target = self;
        [config.userContentController addScriptMessageHandler:handler name:kHandler];
        [config.userContentController addUserScript:[[WKUserScript alloc] initWithSource:kBridge injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];

        UIView* parent = UnityGetGLViewController().view;
        _webView = [[WKWebView alloc] initWithFrame:parent.bounds configuration:config];
        _webView.navigationDelegate = self;
        _webView.UIDelegate = self;
        _webView.opaque = NO;
        _webView.backgroundColor = UIColor.clearColor;
        _webView.scrollView.backgroundColor = UIColor.clearColor;
        _webView.scrollView.bounces = NO;
        _webView.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;   // the page keeps clear of the notch itself
        _webView.allowsLinkPreview = NO;
        _webView.hidden = YES;
        // keeps its share of the game's view when that turns or resizes
        _webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight | UIViewAutoresizingFlexibleLeftMargin
            | UIViewAutoresizingFlexibleRightMargin | UIViewAutoresizingFlexibleTopMargin | UIViewAutoresizingFlexibleBottomMargin;
        [parent addSubview:_webView];
    }
    return self;
}

- (void)tell:(const char*)method message:(NSString*)message
{
    UnitySendMessage(self.listener.UTF8String, method, (message ?: @"").UTF8String);
}

- (void)layout
{
    CGRect bounds = self.webView.superview.bounds;
    self.webView.frame = CGRectMake(bounds.size.width * self.unit.origin.x, bounds.size.height * self.unit.origin.y,
                                    bounds.size.width * self.unit.size.width, bounds.size.height * self.unit.size.height);
}

- (void)destroy
{
    [self.webView stopLoading];
    [self.webView.configuration.userContentController removeScriptMessageHandlerForName:kHandler];
    self.webView.navigationDelegate = nil;
    self.webView.UIDelegate = nil;
    [self.webView removeFromSuperview];
    self.webView = nil;
}

- (void)userContentController:(WKUserContentController*)controller didReceiveScriptMessage:(WKScriptMessage*)message
{
    if (message.frameInfo.isMainFrame && [message.body isKindOfClass:NSString.class]) { [self tell:"NativeMessage" message:message.body]; }
}

- (void)webView:(WKWebView*)webView didStartProvisionalNavigation:(WKNavigation*)navigation
{
    [self tell:"NativePageStarted" message:webView.URL.absoluteString];
}

- (void)webView:(WKWebView*)webView didFinishNavigation:(WKNavigation*)navigation
{
    [self tell:"NativePageFinished" message:webView.URL.absoluteString];
}

- (void)failed:(NSError*)error
{
    if (error.code == NSURLErrorCancelled) { return; }   // another load took its place
    [self tell:"NativePageFailed" message:[NSString stringWithFormat:@"%ld|%@", (long)error.code, error.localizedDescription]];
}

- (void)webView:(WKWebView*)webView didFailProvisionalNavigation:(WKNavigation*)navigation withError:(NSError*)error { [self failed:error]; }
- (void)webView:(WKWebView*)webView didFailNavigation:(WKNavigation*)navigation withError:(NSError*)error { [self failed:error]; }

- (void)webView:(WKWebView*)webView decidePolicyForNavigationResponse:(WKNavigationResponse*)response decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler
{
    if (response.isForMainFrame && [response.response isKindOfClass:NSHTTPURLResponse.class])
    {
        NSInteger status = ((NSHTTPURLResponse*)response.response).statusCode;
        if (status >= 400) { [self tell:"NativePageFailed" message:[NSString stringWithFormat:@"%ld|HTTP %ld", (long)status, (long)status]]; }
    }
    decisionHandler(WKNavigationResponsePolicyAllow);
}

// http(s) is the page's own business; anything else (mailto:, itms-apps:, another app's scheme) is the system's,
// when it's the page that asks. A frame inside it (an ad's playable, someone else's code) that sends itself to
// one is refused: it would open a store, or another app, that nobody tapped for.
- (void)webView:(WKWebView*)webView decidePolicyForNavigationAction:(WKNavigationAction*)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler
{
    NSURL* url = action.request.URL;
    NSString* scheme = url.scheme.lowercaseString ?: @"";
    if ([@[@"http", @"https", @"about", @"data", @"blob"] containsObject:scheme])
    {
        decisionHandler(WKNavigationActionPolicyAllow);
        return;
    }
    BOOL ofThePage = action.sourceFrame.isMainFrame && (!action.targetFrame || action.targetFrame.isMainFrame);
    if (ofThePage) { [UIApplication.sharedApplication openURL:url options:@{} completionHandler:nil]; }
    decisionHandler(WKNavigationActionPolicyCancel);
}

// a link for a new window opens in this one
- (WKWebView*)webView:(WKWebView*)webView createWebViewWithConfiguration:(WKWebViewConfiguration*)configuration forNavigationAction:(WKNavigationAction*)action windowFeatures:(WKWindowFeatures*)features
{
    if (!action.targetFrame.isMainFrame) { [webView loadRequest:action.request]; }
    return nil;
}

// iOS ends a web view's process when memory is short: the page is gone
- (void)webViewWebContentProcessDidTerminate:(WKWebView*)webView
{
    [self tell:"NativeLost" message:@""];
}

@end

static NSString* Str(const char* s) { return s ? [NSString stringWithUTF8String:s] : @""; }
static HANativeWebView* View(void* handle) { return (__bridge HANativeWebView*)handle; }

extern "C" {

void* _HAWebView_Create(const char* listener)
{
    return (void*)CFBridgingRetain([[HANativeWebView alloc] initWithListener:Str(listener)]);
}

void _HAWebView_Destroy(void* handle)
{
    if (!handle) { return; }
    HANativeWebView* view = (HANativeWebView*)CFBridgingRelease(handle);
    [view destroy];
}

void _HAWebView_LoadUrl(void* handle, const char* url)
{
    NSURL* address = [NSURL URLWithString:Str(url)];
    if (address) { [View(handle).webView loadRequest:[NSURLRequest requestWithURL:address]]; }
}

// The page is `html`, as if it had come from `baseUrl`: its storage is that origin's.
void _HAWebView_LoadHtml(void* handle, const char* html, const char* baseUrl)
{
    [View(handle).webView loadHTMLString:Str(html) baseURL:[NSURL URLWithString:Str(baseUrl)]];
}

void _HAWebView_Evaluate(void* handle, const char* javascript)
{
    [View(handle).webView evaluateJavaScript:Str(javascript) completionHandler:nil];
}

void _HAWebView_Stop(void* handle)
{
    [View(handle).webView stopLoading];
}

// Where it is, as fractions of the game's view from its top left.
void _HAWebView_SetFrame(void* handle, float left, float top, float width, float height)
{
    View(handle).unit = CGRectMake(left, top, width, height);
    [View(handle) layout];
}

void _HAWebView_SetVisible(void* handle, bool visible)
{
    HANativeWebView* view = View(handle);
    if (visible) { [view layout]; [view.webView.superview bringSubviewToFront:view.webView]; }
    view.webView.hidden = !visible;
}

void _HAWebView_SetAlpha(void* handle, float alpha)
{
    View(handle).webView.alpha = alpha;
}

}
