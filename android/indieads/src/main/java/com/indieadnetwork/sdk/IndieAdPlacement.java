package com.indieadnetwork.sdk;

/** A place in the game where an ad may be shown, by the name the game and the dashboard call it. */
public final class IndieAdPlacement {
    public String id;
    public IndieAdFormat format = IndieAdFormat.REWARDED;
    /** The longest creative this placement takes, in seconds. 0 = any. */
    public int maxSecs = 30;
    /**
     * The least time this placement holds the player to an ad, in seconds. -1 = unsaid. Interstitial: a video offers Skip
     * at that time (12 s at the latest), and ✕ is on its end card 3 s after Skip (unsaid: skipAfter; 15 at most). Rewarded:
     * the reward can be claimed from then (unsaid: the creative's own time, its end unless it says earlier). The dashboard
     * can say another for a placement, by its name.
     */
    public double minSecs = -1;
    /** Interstitial: minSecs, as it was called before 0.6.3. Read where minSecs is unsaid. */
    public double skipAfter = 5;
    /** Rewarded: what watching earns, as the player is told it ("Earned: …"). Null = "Reward earned". */
    public String reward;

    public IndieAdPlacement(String id, IndieAdFormat format) {
        this.id = id;
        this.format = format;
    }

    public static IndieAdPlacement rewarded(String id) { return new IndieAdPlacement(id, IndieAdFormat.REWARDED); }

    public static IndieAdPlacement interstitial(String id) { return new IndieAdPlacement(id, IndieAdFormat.INTERSTITIAL); }

    public IndieAdPlacement maxSecs(int secs) { maxSecs = secs; return this; }

    public IndieAdPlacement minSecs(double secs) { minSecs = secs; return this; }

    public IndieAdPlacement reward(String what) { reward = what; return this; }

    IndieAdPlacement copy() {
        IndieAdPlacement p = new IndieAdPlacement(id, format);
        p.maxSecs = maxSecs;
        p.minSecs = minSecs;
        p.skipAfter = skipAfter;
        p.reward = reward;
        return p;
    }
}
