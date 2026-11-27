package com.indieadnetwork.sdk;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Uri;

/**
 * What the device is asked, on the page's behalf: whether the network costs the player, what a consent platform kept,
 * and to open a store or a page. What else is on the device is never asked. (The Unity package's IndieAdsNative.cs.)
 */
final class Device {

    private Device() {}

    private static final String PLAY_STORE = "com.android.vending";

    /** Mobile data, a hotspot, a metered Wi-Fi network: creatives aren't downloaded ahead on one. */
    static boolean isMetered(Context context) {
        try {
            ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            return connectivity != null && connectivity.isActiveNetworkMetered();
        } catch (SecurityException e) {   // ACCESS_NETWORK_STATE taken out of the app's manifest
            return false;
        }
    }

    /**
     * What a consent platform has kept of the player's answer, by the IAB framework's names, in the app's default
     * preferences, where the framework says they're kept. IABTCF_gdprApplies is 1 where the law asks for consent;
     * IABTCF_PurposeConsents has a character a purpose, "1" first where storing on the device is agreed.
     * → true (agreed, or needn't be asked), false, or null: no platform has said.
     */
    static Boolean cmpConsent(Context context) {
        SharedPreferences kept = context.getSharedPreferences(context.getPackageName() + "_preferences", Context.MODE_PRIVATE);
        try {
            if (!kept.contains("IABTCF_gdprApplies")) return null;
            int applies = kept.getInt("IABTCF_gdprApplies", 0);
            String purposes = kept.getString("IABTCF_PurposeConsents", "");
            return applies == 0 || (purposes != null && purposes.startsWith("1"));
        } catch (ClassCastException e) {   // kept as something else than the framework says: as if no platform had said
            return null;
        }
    }

    /** `url`, else `fallback`, outside the game: Google Play itself for a market:// link. False: nothing here opens either. */
    static boolean openStore(Activity activity, String url, String fallback) {
        return view(activity, url) || view(activity, fallback);
    }

    static boolean view(Activity activity, String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (url.startsWith("market://")) intent.setPackage(PLAY_STORE);   // Google Play itself, not a chooser
            activity.startActivity(intent);
            return true;
        } catch (Exception e) {   // no Play Store on this device, or nothing that opens the link
            return false;
        }
    }
}
