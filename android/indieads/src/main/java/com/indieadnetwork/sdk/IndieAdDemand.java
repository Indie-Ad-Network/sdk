package com.indieadnetwork.sdk;

/** What there is to show this player in a placement now, and what share of the game's slots the network asks for. */
public final class IndieAdDemand {
    static final IndieAdDemand NONE = new IndieAdDemand(0, 0, 0);

    /** 0–1. Already 0 when nothing is available. */
    public final double share;
    /**
     * How many creatives this player could be shown here: 0 if they have every game, or have seen each as often as it may
     * be shown today, or none is downloaded yet.
     */
    public final int available;
    /**
     * How many of the games among them this game's studio owes showings (0.7.1). showIfWanted gives the slot to them
     * whenever there's one, before the share is rolled; wants goes by the share alone.
     */
    public final int owed;

    IndieAdDemand(double share, int available, int owed) {
        this.share = share;
        this.available = available;
        this.owed = owed;
    }

    @Override public String toString() { return "IndieAdDemand{share=" + share + ", available=" + available + ", owed=" + owed + "}"; }
}
