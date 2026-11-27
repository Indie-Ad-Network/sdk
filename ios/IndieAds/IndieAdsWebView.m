// A WKWebView laid over the game's view: the Unity package's Plugins/iOS/NativeWebView.mm, with a listener in place of
// UnitySendMessage. The page talks back with window.nativeWebView.postMessage(string). Only the page itself is heard: a
// frame inside it (an ad's playable) is not. Nor can a frame open another app.
#import <WebKit/WebKit.h>
#import "IndieAdsPrivate.h"

static NSString* const kHandler = @"nativeWebView";
static NSString* const kBridge = @"window.nativeWebView={postMessage:function(s){window.webkit.messageHandlers.nativeWebView.postMessage(String(s));}};";

// WKUserContentController keeps its handler: a go-between that doesn't keep the web view, so it can be let go.
@interface IAWeakHandler : NSObject <WKScriptMessageHandler>
@property (nonatomic, weak) id<WKScriptMessageHandler> target;
@end

@implementation IAWeakHandler
- (void)userContentController:(WKUserContentController*)controller didReceiveScriptMessage:(WKScriptMessage*)message
{
    [self.target userContentController:controller didReceiveScriptMessage:message];
}
@end

@interface IAWebView () <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler>
@property (nonatomic, strong, nullable) WKWebView* webView;
@property (nonatomic, weak) id<IAWebViewListener> listener;
@end

@implementation IAWebView

- (instancetype)initInView:(UIView*)parent listener:(id<IAWebViewListener>)listener inspectable:(BOOL)inspectable
{
    if ((self = [super init])) {
        _listener = listener;
        WKWebViewConfiguration* config = [WKWebViewConfiguration new];
        config.allowsInlineMediaPlayback = YES;                                         // in the page, not the system's full-screen player
        config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;   // the tap was on the game's own button
        IAWeakHandler* handler = [IAWeakHandler new];
        handler.target = self;
        [config.userContentController addScriptMessageHandler:handler name:kHandler];
        [config.userContentController addUserScript:[[WKUserScript alloc] initWithSource:kBridge injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];

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
        _webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;   // the whole of the game's view, as it turns
        if (@available(iOS 16.4, *)) { _webView.inspectable = inspectable; }   // Safari's Web Inspector, when the game asks for logs
        [parent addSubview:_webView];
    }
    return self;
}

- (void)loadUrl:(NSString*)url
{
    NSURL* address = [NSURL URLWithString:url];
    if (address) [self.webView loadRequest:[NSURLRequest requestWithURL:address]];
}

- (void)loadHtml:(NSString*)html baseUrl:(NSString*)baseUrl
{
    [self.webView loadHTMLString:html baseURL:[NSURL URLWithString:baseUrl]];
}

- (void)evaluate:(NSString*)javascript
{
    [self.webView evaluateJavaScript:javascript completionHandler:nil];
}

- (void)setVisible:(BOOL)visible
{
    WKWebView* view = self.webView;
    if (!view) return;
    if (visible) {
        view.frame = view.superview.bounds;
        [view.superview bringSubviewToFront:view];
    }
    view.hidden = !visible;
}

- (void)destroy
{
    WKWebView* view = self.webView;
    if (!view) return;
    self.webView = nil;
    [view stopLoading];
    [view.configuration.userContentController removeScriptMessageHandlerForName:kHandler];
    view.navigationDelegate = nil;
    view.UIDelegate = nil;
    [view removeFromSuperview];
}

- (void)userContentController:(WKUserContentController*)controller didReceiveScriptMessage:(WKScriptMessage*)message
{
    if (self.webView && message.frameInfo.isMainFrame && [message.body isKindOfClass:NSString.class]) {
        [self.listener webView:self said:message.body];
    }
}

- (void)failed:(NSError*)error
{
    if (error.code == NSURLErrorCancelled) return;   // another load took its place
    [self.listener webView:self failed:error.code message:error.localizedDescription ?: @""];
}

- (void)webView:(WKWebView*)webView didFailProvisionalNavigation:(WKNavigation*)navigation withError:(NSError*)error { [self failed:error]; }
- (void)webView:(WKWebView*)webView didFailNavigation:(WKNavigation*)navigation withError:(NSError*)error { [self failed:error]; }

- (void)webView:(WKWebView*)webView decidePolicyForNavigationResponse:(WKNavigationResponse*)response decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler
{
    if (response.isForMainFrame && [response.response isKindOfClass:NSHTTPURLResponse.class]) {
        NSInteger status = ((NSHTTPURLResponse*)response.response).statusCode;
        if (status >= 400) [self.listener webView:self failed:status message:[NSString stringWithFormat:@"HTTP %ld", (long)status]];
    }
    decisionHandler(WKNavigationResponsePolicyAllow);
}

// http(s) is the page's own business; anything else (itms-apps:, mailto:, another app's scheme) is the system's, when
// it's the page that asks. A frame inside it (an ad's playable, someone else's code) that sends itself to one is
// refused: it would open a store, or another app, that nobody tapped for.
- (void)webView:(WKWebView*)webView decidePolicyForNavigationAction:(WKNavigationAction*)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler
{
    NSURL* url = action.request.URL;
    NSString* scheme = url.scheme.lowercaseString ?: @"";
    if ([@[@"http", @"https", @"about", @"data", @"blob"] containsObject:scheme]) {
        decisionHandler(WKNavigationActionPolicyAllow);
        return;
    }
    BOOL ofThePage = action.sourceFrame.isMainFrame && (!action.targetFrame || action.targetFrame.isMainFrame);
    if (ofThePage) [UIApplication.sharedApplication openURL:url options:@{} completionHandler:nil];
    decisionHandler(WKNavigationActionPolicyCancel);
}

// a link for a new window opens in this one
- (WKWebView*)webView:(WKWebView*)webView createWebViewWithConfiguration:(WKWebViewConfiguration*)configuration forNavigationAction:(WKNavigationAction*)action windowFeatures:(WKWindowFeatures*)features
{
    if (!action.targetFrame.isMainFrame) [webView loadRequest:action.request];
    return nil;
}

// iOS ends a web view's process when memory is short: the page is gone
- (void)webViewWebContentProcessDidTerminate:(WKWebView*)webView
{
    if (self.webView) [self.listener webViewLost:self];
}

@end
