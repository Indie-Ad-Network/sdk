package com.indieadnetwork.sdk;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.preference.PreferenceManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** indie-ads' native side on Android (capacitor/index.js says what each call is for). */
@CapacitorPlugin(name = "IndieAds")
public class IndieAdsPlugin extends Plugin {

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
     * What a consent platform has kept of the player's answer, by the IAB framework's names, where the framework
     * says they're kept (the app's default preferences): `applies` (1: the law asks for consent here; left out where
     * no platform has said) and `purposes` (a character a purpose, "1" first where storing on the device is agreed).
     */
    @PluginMethod
    public void consent(PluginCall call) {
        JSObject out = new JSObject();
        try {
            SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(getContext());
            if (prefs.contains("IABTCF_gdprApplies")) out.put("applies", prefs.getInt("IABTCF_gdprApplies", 0));
            out.put("purposes", prefs.getString("IABTCF_PurposeConsents", ""));
        } catch (ClassCastException e) {
            // kept as something else than the framework says: as if no platform had said
        }
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

    /** `referrer`: what Google Play keeps of the store link the app was installed from (InstallReferrer), or null. */
    @PluginMethod
    public void installReferrer(PluginCall call) {
        InstallReferrer.read(getContext(), referrer -> {
            JSObject out = new JSObject();
            out.put("referrer", referrer);
            call.resolve(out);
        });
    }
}
