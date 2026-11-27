# The page calls window.nativeWebView.postMessage, which the web view finds by name.
-keepclassmembers class com.indieadnetwork.sdk.AdWebView$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
