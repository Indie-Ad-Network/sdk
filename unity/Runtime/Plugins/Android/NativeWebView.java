package com.thevoxelagents.houseads;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
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
import android.widget.FrameLayout;

import com.unity3d.player.UnityPlayer;

/**
 * A web view laid over the Unity game: the system's own (android.webkit.WebView), added to the
 * game's activity above its surface. Runtime/NativeWebView.cs is its Unity side and says what
 * each call is for; what happens here is sent to the GameObject named `listener`.
 *
 * Every method may be called from any thread: the work is done on the UI thread, in order.
 * The page talks back with window.nativeWebView.postMessage(string), which any frame of the
 * page can call: a listener that matters must be able to tell its own page's words from a
 * frame's (house-ads' page sends a key only it was given).
 */
public class NativeWebView {

    private final Activity activity;
    private final String listener;
    // the page's console (and a playable's) goes to logcat only when the game asks for logs
    private final boolean logConsole;
    private WebView webView;
    // of the activity's content, 0–1: kept so the view is laid out again when the content's size changes
    private float left = 0, top = 0, width = 1, height = 1;
    private boolean visible = false;
    private View.OnLayoutChangeListener onLayout;

    public NativeWebView(Activity activity, String listener, boolean logConsole) {
        this.activity = activity;
        this.listener = listener;
        this.logConsole = logConsole;
        ui(new Runnable() { @Override public void run() { create(); } });
    }

    private void tell(String method, String message) {
        UnityPlayer.UnitySendMessage(listener, method, message == null ? "" : message);
    }

    private void ui(Runnable work) {
        activity.runOnUiThread(work);
    }

    private ViewGroup content() {
        return (ViewGroup) activity.findViewById(android.R.id.content);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void create() {
        webView = new WebView(activity) {
            // the back button is the page's to answer (an ad's ✕), not "leave the game"
            @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
                if (keyCode == KeyEvent.KEYCODE_BACK) { return true; }
                return super.onKeyDown(keyCode, event);
            }
            @Override public boolean onKeyUp(int keyCode, KeyEvent event) {
                if (keyCode == KeyEvent.KEYCODE_BACK) { tell("NativeBack", ""); return true; }
                return super.onKeyUp(keyCode, event);
            }
        };
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
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface public void postMessage(String message) { tell("NativeMessage", message); }
        }, "nativeWebView");
        webView.setWebChromeClient(new WebChromeClient() {
            // true: handled, so the system doesn't write it to logcat
            @Override public boolean onConsoleMessage(ConsoleMessage message) { return !logConsole; }
        });
        webView.setWebViewClient(new Client());

        content().addView(webView, new FrameLayout.LayoutParams(0, 0));
        onLayout = new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int t, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l != or - ol || b - t != ob - ot) { layout(); }
            }
        };
        content().addOnLayoutChangeListener(onLayout);
        layout();
    }

    private void layout() {
        if (webView == null) { return; }
        ViewGroup content = content();
        int w = content.getWidth(), h = content.getHeight();
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(Math.round(width * w), Math.round(height * h));
        params.leftMargin = Math.round(left * w);
        params.topMargin = Math.round(top * h);
        webView.setLayoutParams(params);
    }

    private class Client extends WebViewClient {
        @Override public void onPageStarted(WebView view, String url, Bitmap favicon) { tell("NativePageStarted", url); }
        @Override public void onPageFinished(WebView view, String url) { tell("NativePageFinished", url); }

        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) { tell("NativePageFailed", error.getErrorCode() + "|" + error.getDescription()); }
        }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame()) { tell("NativePageFailed", response.getStatusCode() + "|HTTP " + response.getStatusCode()); }
        }

        // http(s) is the page's own business; anything else (mailto:, market:, another app's scheme) is the system's,
        // when it's the page that asks. A frame inside it (an ad's playable, someone else's code) that sends itself
        // to one is refused: it would open a store, or another app, that nobody tapped for.
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase();
            if (scheme.equals("http") || scheme.equals("https") || scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) { return false; }
            if (!request.isForMainFrame()) { return true; }
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception e) {
                // nothing on this device opens it
            }
            return true;
        }

        // The page's process is gone (memory, or a crash of its own): this view is no more use, and
        // saying we've handled it is what keeps the game itself alive.
        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            tell("NativeLost", "");
            destroyNow();
            return true;
        }
    }

    public void loadUrl(final String url) {
        ui(new Runnable() { @Override public void run() { if (webView != null) { webView.loadUrl(url); } } });
    }

    /** The page is `html`, as if it had come from `baseUrl`: its storage is that origin's. */
    public void loadHtml(final String html, final String baseUrl) {
        ui(new Runnable() { @Override public void run() { if (webView != null) { webView.loadDataWithBaseURL(baseUrl, html, "text/html", "utf-8", null); } } });
    }

    public void evaluate(final String javascript) {
        ui(new Runnable() { @Override public void run() { if (webView != null) { webView.evaluateJavascript(javascript, null); } } });
    }

    public void stop() {
        ui(new Runnable() { @Override public void run() { if (webView != null) { webView.stopLoading(); } } });
    }

    /** Where it is, as fractions of the game's window from its top left. */
    public void setFrame(final float left, final float top, final float width, final float height) {
        ui(new Runnable() { @Override public void run() {
            NativeWebView.this.left = left; NativeWebView.this.top = top; NativeWebView.this.width = width; NativeWebView.this.height = height;
            layout();
        } });
    }

    public void setVisible(final boolean show) {
        ui(new Runnable() { @Override public void run() {
            if (webView == null || visible == show) { return; }
            visible = show;
            webView.setVisibility(show ? View.VISIBLE : View.GONE);
            if (show) {
                webView.bringToFront();
                webView.requestFocus();      // so the back button comes here
            } else {
                webView.clearFocus();
                content().requestFocus();    // and the game has its keys again
            }
        } });
    }

    public void setAlpha(final float alpha) {
        ui(new Runnable() { @Override public void run() { if (webView != null) { webView.setAlpha(alpha); } } });
    }

    /** The game has gone to the background, or come back: timers, video and sound stop and start with it. */
    public void setPaused(final boolean paused) {
        ui(new Runnable() { @Override public void run() {
            if (webView == null) { return; }
            if (paused) { webView.onPause(); } else { webView.onResume(); }
        } });
    }

    public void destroy() {
        ui(new Runnable() { @Override public void run() { destroyNow(); } });
    }

    private void destroyNow() {
        if (webView == null) { return; }
        WebView gone = webView;
        webView = null;
        content().removeOnLayoutChangeListener(onLayout);
        gone.stopLoading();
        gone.removeJavascriptInterface("nativeWebView");
        gone.setWebViewClient(new WebViewClient());
        content().removeView(gone);
        gone.destroy();
    }
}
