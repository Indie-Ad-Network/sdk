package com.indieadnetwork.sdk;

/** What there is to show this player in a placement now, and what share of the game's slots the network asks for. */
public final class IndieAdDemand {
    static final IndieAdDemand NONE = new IndieAdDemand(0, 0);

    /** 0–1. Already 0 when nothing is available. */
    public final double share;
    /**
     * How many creatives this player could be shown here: 0 if they have every game, or have seen each as often as it may
     * be shown today, or none is downloaded yet.
     */
    public final int available;

    IndieAdDemand(double share, int available) {
        this.share = share;
        this.available = available;
    }

    @Override public String toString() { return "IndieAdDemand{share=" + share + ", available=" + available + "}"; }
}
