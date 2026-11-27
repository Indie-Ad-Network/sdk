package com.indieadnetwork.sdk;

/** How a showing went: IndieAds.show's callback has it once the ad has closed, or failed to appear. */
public final class IndieAdResult {
    /** An ad was put in front of the player. False: nothing happened, show another network's. */
    public final boolean shown;
    /** Rewarded: watched to the end of the countdown. Always false for an interstitial. */
    public final boolean granted;
    public final String creative, app, kind;
    public final double watchedSecs;
    /**
     * "house": the network's ad was put in front of the player. Null: none was; with showIfWanted, because the slot wasn't
     * the network's, or none appeared: either way, show your paid network's.
     */
    public final String via;

    IndieAdResult(boolean shown, boolean granted, String creative, String app, String kind, double watchedSecs) {
        this.shown = shown;
        this.granted = granted;
        this.creative = creative;
        this.app = app;
        this.kind = kind;
        this.watchedSecs = watchedSecs;
        this.via = shown ? "house" : null;
    }

    static IndieAdResult ended(boolean shown) { return new IndieAdResult(shown, false, null, null, null, 0); }

    @Override public String toString() {
        return "IndieAdResult{shown=" + shown + ", granted=" + granted + ", via=" + via + ", creative=" + creative + ", app=" + app + ", kind=" + kind + ", watchedSecs=" + watchedSecs + "}";
    }
}
