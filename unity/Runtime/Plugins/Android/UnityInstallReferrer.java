package com.indieadnetwork.sdk;

import android.content.Context;

import com.unity3d.player.UnityPlayer;

/** InstallReferrer for Runtime/IndieAdsNative.cs: the GameObject named `listener` is sent NativeInstallReferrer, with the referrer or "". */
public final class UnityInstallReferrer {

    private UnityInstallReferrer() {}

    public static void readFor(Context context, final String listener) {
        InstallReferrer.read(context, new InstallReferrer.Done() {
            @Override
            public void with(String referrer) {
                UnityPlayer.UnitySendMessage(listener, "NativeInstallReferrer", referrer == null ? "" : referrer);
            }
        });
    }
}
