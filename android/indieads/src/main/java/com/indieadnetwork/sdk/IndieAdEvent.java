package com.indieadnetwork.sdk;

/**
 * An event of the player, for the game's own analytics: offer, show, q25…q100, first_touch, complete, reward, exit_kept,
 * exit_early, keep_playing, store_banner, store_open, cache_miss, fail; and step, a playable's own name (`step`) for
 * somewhere in it a showing reached. One fail is the SDK's own, not the page's, and the network's ingest doesn't hear it:
 * an ad's web view went while it was up, `why` lost (the system said) or unanswered (silent as the game came back).
 * Fields the event doesn't have are null (secs: 0).
 */
public final class IndieAdEvent {
    public final String event, placement, creative, app, kind, why, via, step;
    public final double secs;

    IndieAdEvent(String event, String placement, String creative, String app, String kind, String why, String via, String step, double secs) {
        this.event = event;
        this.placement = placement;
        this.creative = creative;
        this.app = app;
        this.kind = kind;
        this.why = why;
        this.via = via;
        this.step = step;
        this.secs = secs;
    }

    @Override public String toString() {
        StringBuilder s = new StringBuilder("IndieAdEvent{").append(event);
        if (placement != null) s.append(" placement=").append(placement);
        if (creative != null) s.append(" creative=").append(creative);
        if (app != null) s.append(" app=").append(app);
        if (kind != null) s.append(" kind=").append(kind);
        if (why != null) s.append(" why=").append(why);
        if (via != null) s.append(" via=").append(via);
        if (step != null) s.append(" step=").append(step);
        if (secs != 0) s.append(" secs=").append(secs);
        return s.append('}').toString();
    }
}
