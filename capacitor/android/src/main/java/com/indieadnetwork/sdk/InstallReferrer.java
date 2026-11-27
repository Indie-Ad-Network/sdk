package com.indieadnetwork.sdk;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Parcel;

/**
 * The install referrer Google Play keeps for this app: the `referrer` of the store link it was installed from
 * (core/storeLinks.js puts the ad's labels in it), for 90 days after the install. Null for an install from anywhere
 * else, after those days, or where Play can't be asked. It's asked of Play's own service, the one Google's Install
 * Referrer library binds to, so a game takes no library for it; nothing is kept, and it's asked each time.
 *
 * Play must be visible to the app (Android 11 on): the Capacitor plugin's and the native SDK's manifests ask to see it,
 * and unity/README.md says when a Unity game must.
 *
 * The same file is in capacitor/android/… and unity/Runtime/Plugins/Android/ (test/installReferrer.test.mjs keeps them so), and
 * the native SDK (android/indieads) takes Unity's as it builds.
 */
final class InstallReferrer {

    interface Done {
        void with(String referrer);
    }

    private static final String PLAY_STORE = "com.android.vending";
    private static final String SERVICE = "com.google.android.finsky.externalreferrer.GetInstallReferrerService";
    private static final String BIND = "com.google.android.finsky.BIND_GET_INSTALL_REFERRER_SERVICE";
    private static final String DESCRIPTOR = "com.google.android.finsky.externalreferrer.IGetInstallReferrerService";
    private static final long WAIT_MS = 5000;   // Play that hasn't answered by then won't: the game isn't kept waiting

    private InstallReferrer() {}

    /** `done` is called once, on the main thread. */
    static void read(Context context, Done done) {
        new Asking(context.getApplicationContext(), done).start();
    }

    // One asking: bound, answered or timed out, unbound.
    private static final class Asking implements ServiceConnection, Runnable {
        private final Context app;
        private final Done done;
        private final Handler main = new Handler(Looper.getMainLooper());
        private boolean bound, answered;   // the main thread's alone

        Asking(Context app, Done done) {
            this.app = app;
            this.done = done;
        }

        void start() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    bind();
                }
            });
        }

        private void bind() {
            Intent intent = new Intent(BIND).setComponent(new ComponentName(PLAY_STORE, SERVICE));
            try {
                bound = app.bindService(intent, this, Context.BIND_AUTO_CREATE);
            } catch (SecurityException e) {
                bound = false;
            }
            if (bound) main.postDelayed(this, WAIT_MS);
            else answer(null);   // no Play Store, one too old to have the service, or one the app can't see
        }

        @Override
        public void run() {
            answer(null);
        }

        // Play's answer is another process's: asked off the main thread, which is the game's (or its web view's)
        @Override
        public void onServiceConnected(ComponentName name, final IBinder binder) {
            final String packageName = app.getPackageName();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    final String referrer = ask(binder, packageName);
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            answer(referrer);
                        }
                    });
                }
            }, "indie-ads-referrer").start();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            answer(null);
        }

        // ServiceConnection's own from API 26 and 28: unannotated, so the class builds against an older SDK too
        public void onBindingDied(ComponentName name) {
            answer(null);
        }

        public void onNullBinding(ComponentName name) {
            answer(null);
        }

        private void answer(String referrer) {
            if (answered) return;
            answered = true;
            main.removeCallbacks(this);
            if (bound) {
                try {
                    app.unbindService(this);
                } catch (IllegalArgumentException e) {
                    // already gone
                }
            }
            done.with(referrer);
        }
    }

    // IGetInstallReferrerService.getInstallReferrer(Bundle { package_name }), its one call: a Bundle back, its referrer
    // under install_referrer. The click and install times beside it aren't read.
    private static String ask(IBinder binder, String packageName) {
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            Bundle asked = new Bundle();
            asked.putString("package_name", packageName);
            data.writeInterfaceToken(DESCRIPTOR);
            data.writeInt(1);
            asked.writeToParcel(data, 0);
            binder.transact(IBinder.FIRST_CALL_TRANSACTION, data, reply, 0);
            reply.readException();
            if (reply.readInt() == 0) return null;
            String referrer = Bundle.CREATOR.createFromParcel(reply).getString("install_referrer");
            return referrer == null || referrer.isEmpty() ? null : referrer;
        } catch (Exception e) {   // Play said no, or said it some other way
            return null;
        } finally {
            data.recycle();
            reply.recycle();
        }
    }
}
