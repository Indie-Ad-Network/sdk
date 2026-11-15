package com.thevoxelagents.houseads;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** house-ads' native side on Android (capacitor/index.js says what each call is for). */
@CapacitorPlugin(name = "HouseAds")
public class HouseAdsPlugin extends Plugin {

    private static final String PLAY_STORE = "com.android.vending";

    /**
     * `url`, then `fallback`, opened outside the app; a market:// link goes to Google Play itself,
     * not a chooser. Resolves at once: the game is in the background by then.
     */
    @PluginMethod
    public void openStore(PluginCall call) {
        if (!view(call.getString("url"))) view(call.getString("fallback"));
        call.resolve();
    }

    private boolean view(String url) {
        if (url == null) return false;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (url.startsWith("market://")) intent.setPackage(PLAY_STORE);
            getContext().startActivity(intent);
            return true;
        } catch (Exception e) {   // no Play Store on this device, or nothing that opens the link
            return false;
        }
    }

    /**
     * `package`: whether it's installed. On Android 11 and up the package must be listed in the
     * app manifest's queries element, or the answer is always no.
     */
    @PluginMethod
    public void isInstalled(PluginCall call) {
        String name = call.getString("package");
        boolean installed = false;
        if (name != null) {
            try {
                getContext().getPackageManager().getPackageInfo(name, 0);
                installed = true;
            } catch (PackageManager.NameNotFoundException e) {
                // not installed, or not ours to see
            }
        }
        JSObject out = new JSObject();
        out.put("installed", installed);
        call.resolve(out);
    }

    /** `metered`: mobile data, or a Wi-Fi network marked as metered. */
    @PluginMethod
    public void network(PluginCall call) {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        JSObject out = new JSObject();
        out.put("metered", cm != null && cm.isActiveNetworkMetered());
        call.resolve(out);
    }
}
