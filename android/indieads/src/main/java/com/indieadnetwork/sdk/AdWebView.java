package com.indieadnetwork.sdk;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.widget.FrameLayout;

/**
 * The system's web view (android.webkit.WebView) laid over the whole of the game's activity, above whatever the game
 * draws with (a GLSurfaceView, a SurfaceView, views). The native SDK's counterpart of the Unity package's
 * Plugins/Android/NativeWebView.java, with a listener in place of UnitySendMessage.
 *
 * Main thread only: it's made, told and destroyed there, and its listener is called there. The page talks back with
 * window.nativeWebView.postMessage(string), which any frame of the page can call: IndieAds acts only on messages that
 * carry the key it gave its own page.
 */
final class AdWebView {

    /** What a web view says, with which one it is. */
    interface Listener {
        void onMessage(AdWebView from, String message);
        /** The device's back button, with the page on screen. */
        void onBack(AdWebView from);
        /** The page's process is gone: this one is no more use. */
        void onLost(AdWebView from);
        /** The main frame wouldn't load (an error, or an HTTP status that is one). */
        void onPageFailed(AdWebView from, int code, String message);
    }

    // a web view couldn't be made on this device: there's none to be had until the game starts again
    private static volatile boolean unavailable = false;

    static boolean isAvailable() {
        return !unavailable;
    }

    private final Activity activity;
    private final Listener listener;
    private final boolean logConsole;   // the page's console (and a playable's) goes to logcat only when the game asks for logs
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView webView;
    private boolean visible = false;
    private Object backCallback;   // Android 13 on: an OnBackInvokedCallback, registered while the page is on screen
    private long backAt;           // when the back button was last passed on: one press is never two

    /** Null: no web view could be made here (none installed, or switched off). */
    static AdWebView create(Activity activity, Listener listener, boolean logConsole) {
        if (unavailable) return null;
        AdWebView view = new AdWebView(activity, listener, logConsole);
        return view.webView != null ? view : null;
    }

    private AdWebView(Activity activity, Listener listener, boolean logConsole) {
        this.activity = activity;
        this.listener = listener;
        this.logConsole = logConsole;
        create();
    }

    private ViewGroup content() {
        return (ViewGroup) activity.findViewById(android.R.id.content);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void create() {
        try {
            webView = new WebView(activity) {
                // the back button is the page's to answer (an ad's ✕), not "leave the game"
                @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
                    if (keyCode == KeyEvent.KEYCODE_BACK) return true;
                    return super.onKeyDown(keyCode, event);
                }
                @Override public boolean onKeyUp(int keyCode, KeyEvent event) {
                    if (keyCode == KeyEvent.KEYCODE_BACK) { back(); return true; }
                    return super.onKeyUp(keyCode, event);
                }
            };
        } catch (Throwable e) {
            // No web view on this device (the system throws an Error for it). The game goes on without one: none is made
            // again while it runs.
            unavailable = true;
            webView = null;
            return;
        }
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);                   // localStorage, and with it IndexedDB
        settings.setMediaPlaybackRequiresUserGesture(false);   // the tap was on the game's own button
        settings.setSupportZoom(false);
        settings.setSupportMultipleWindows(false);             // a link for a new window opens in this one
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(false);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setVisibility(View.GONE);
        webView.addJavascriptInterface(new Bridge(), "nativeWebView");
        webView.setWebChromeClient(new WebChromeClient() {
            // true: handled, so the system doesn't write it to logcat
            @Override public boolean onConsoleMessage(ConsoleMessage message) { return !logConsole; }
        });
        webView.setWebViewClient(new Client());
        content().addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    // Called on the web view's own thread: what it says is heard on the main thread, and not at all once it's destroyed.
    final class Bridge {
        @JavascriptInterface public void postMessage(final String message) {
            main.post(new Runnable() {
                @Override public void run() {
                    if (webView != null) listener.onMessage(AdWebView.this, message);
                }
            });
        }
    }

    private void back() {
        long now = SystemClock.elapsedRealtime();
        if (webView == null || !visible || now - backAt < 300) return;
        backAt = now;
        listener.onBack(this);
    }

    private void lost() {
        if (webView == null) return;
        destroy();
        listener.onLost(this);
    }

    private final class Client extends WebViewClient {
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) listener.onPageFailed(AdWebView.this, error.getErrorCode(), String.valueOf(error.getDescription()));
        }

        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame()) listener.onPageFailed(AdWebView.this, response.getStatusCode(), "HTTP " + response.getStatusCode());
        }

        // http(s) is the page's own business; anything else (market:, mailto:, another app's scheme) is the system's,
        // when it's the page that asks. A frame inside it (an ad's playable, someone else's code) that sends itself
        // to one is refused: it would open a store, or another app, that nobody tapped for.
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase();
            if (scheme.equals("http") || scheme.equals("https") || scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) return false;
            if (request.isForMainFrame()) Device.view(activity, url.toString());   // false: nothing on this device opens it
            return true;
        }

        // The page's process is gone (memory, or a crash of its own): this view is no more use, and saying it's handled
        // is what keeps the game itself alive.
        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            lost();
            return true;
        }
    }

    void loadUrl(String url) {
        if (webView != null) webView.loadUrl(url);
    }

    /** The page is `html`, as if it had come from `baseUrl`: its storage is that origin's. */
    void loadHtml(String html, String baseUrl) {
        if (webView != null) webView.loadDataWithBaseURL(baseUrl, html, "text/html", "utf-8", null);
    }

    void evaluate(String javascript) {
        if (webView != null) webView.evaluateJavascript(javascript, null);
    }

    void setVisible(boolean show) {
        if (webView == null || visible == show) return;
        visible = show;
        // A game that set its content again since (setContentView empties the content view) took this with it: put back,
        // or an ad would play where no one can see it, nor close it.
        if (show && webView.getParent() == null) content().addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setVisibility(show ? View.VISIBLE : View.GONE);
        if (show) {
            webView.bringToFront();
            webView.requestFocus();      // so the back button comes here
        } else {
            webView.clearFocus();
            content().requestFocus();    // and the game has its keys again
        }
        if (Build.VERSION.SDK_INT >= 33) {
            if (show) backCallback = Back.register(activity, this);
            else { Back.unregister(activity, backCallback); backCallback = null; }
        }
    }

    /** The game has gone to the background, or come back: the page's video and sound stop and start with it. */
    void setPaused(boolean paused) {
        if (webView == null) return;
        if (paused) webView.onPause(); else webView.onResume();
    }

    void destroy() {
        if (webView == null) return;
        if (Build.VERSION.SDK_INT >= 33) { Back.unregister(activity, backCallback); backCallback = null; }
        WebView gone = webView;
        webView = null;
        visible = false;
        gone.stopLoading();
        gone.removeJavascriptInterface("nativeWebView");
        gone.setWebViewClient(new WebViewClient());
        ViewGroup parent = (ViewGroup) gone.getParent();
        if (parent != null) parent.removeView(gone);
        gone.destroy();
    }

    // Android 13 on, with the app's predictive back (android:enableOnBackInvokedCallback, and the default for apps
    // targeting Android 16): the back button never reaches a view as a key, only the window's dispatcher. Without it
    // the system ignores this and the key comes as ever; either way one press is passed on once.
    private static final class Back {
        static Object register(Activity activity, final AdWebView view) {
            OnBackInvokedCallback callback = new OnBackInvokedCallback() {
                @Override public void onBackInvoked() { view.back(); }
            };
            activity.getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_OVERLAY, callback);
            return callback;
        }

        static void unregister(Activity activity, Object callback) {
            if (callback != null) activity.getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback((OnBackInvokedCallback) callback);
        }
    }
}
