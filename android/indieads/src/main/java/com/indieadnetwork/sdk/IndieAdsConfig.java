package com.indieadnetwork.sdk;

/** What IndieAds.init is told. It's read at init: change test, consent, muted and language later through IndieAds. */
public final class IndieAdsConfig {
    /** This game's id in the catalogue: it's never advertised to itself. */
    public String host;
    /** This game's age rating ("4+", "9+"…): nothing rated above it is shown. Null = anything. */
    public String rating;
    /** The catalogue on the server. Its origin is also the page's: where its storage and downloads are kept. */
    public String catalogueUrl;
    /**
     * The catalogue that shipped with the game, as JSON text, for a first run with no server. Null: the app's asset
     * indie-ads-catalogue.json, if it has one.
     */
    public String shippedCatalogueJson;
    /** The SDK's own analytics endpoint, or null for none. */
    public String ingestUrl;
    /**
     * Where a player's report of an ad is sent (the ingest's /flag), or null for /flag beside ingestUrl. A development build
     * that leaves ingestUrl out, so as to count nothing, can set this and still see its reports arrive: a report from a
     * test showing is sent marked as one, and the dashboard keeps those apart.
     */
    public String reportUrl;
    /** Where the share of this game's ad slots is asked (the ingest's /mix), or null for the catalogue's own word. */
    public String mixUrl;
    /**
     * The network's public key, or null for the one in the shipped catalogue (a signing server writes its key into every
     * catalogue it serves, as "signedBy"). With a key the server's catalogue is used only if the network signed it:
     * someone between the player and the server can't serve ads of their own.
     */
    public String catalogueKey;
    public IndieAdPlacement[] placements;
    /** Is the game muted? An ad starts silent if so. IndieAds.setMuted changes it later. */
    public boolean muted;
    /**
     * The language the player is playing in, if the game has a setting of its own: "fr", "es", "zh-Hant", "pt-BR". A
     * language alone is enough: its region is taken from the device. Null: the device's language. IndieAds.setLanguage
     * changes it later.
     */
    public String language;
    /** The player's reported age, or 0 if not known. Under 13, only the games the network has marked as for them are shown. */
    public int age;
    /**
     * Keep the web view (tens of MB) between ads, as unless said: an ad then starts at once, and what's available is
     * always the word of a page that's up. It's put away all the same when the system says memory is low, and made
     * again a little later. Off: it's put away whenever the page is idle and made again at show, which on a slow phone
     * can be seconds before the ad appears.
     */
    public boolean keepWebView = true;
    /** With the web view put away, look again at what's available when the game comes back to the front after this long. */
    public double refreshAfterSeconds = 600;
    /** Seconds for an ad to start before it's given up as failed. */
    public double showTimeout = 6;
    /**
     * Has the player agreed to anything being kept on their device? The UK and the EEA ask it for advertising. False:
     * nothing is kept there (ads stream, what's been shown is remembered until the game closes, for which the web view is
     * kept between ads, and what an earlier session kept is taken away). IndieAds.setConsent changes it later;
     * IndieAds.cmpConsent reads a consent platform's answer. True unless said.
     */
    public boolean consent = true;
    /**
     * A developer trying the ads out (IndieAds.setTest changes it later): the game's own ads, games that are resting and
     * creatives at their daily cap all count, and nothing is sent to the ingest. Never on in a player's game.
     */
    public boolean test;
    /** Log to logcat (tag IndieAds): what the page says, its warnings and its web view's console. Off, the SDK logs nothing. */
    public boolean log;

    IndieAdsConfig copy() {
        IndieAdsConfig c = new IndieAdsConfig();
        c.host = host;
        c.rating = rating;
        c.catalogueUrl = catalogueUrl;
        c.shippedCatalogueJson = shippedCatalogueJson;
        c.ingestUrl = ingestUrl;
        c.reportUrl = reportUrl;
        c.mixUrl = mixUrl;
        c.catalogueKey = catalogueKey;
        if (placements != null) {
            c.placements = new IndieAdPlacement[placements.length];
            for (int i = 0; i < placements.length; i++) c.placements[i] = placements[i].copy();
        }
        c.muted = muted;
        c.language = language;
        c.age = age;
        c.keepWebView = keepWebView;
        c.refreshAfterSeconds = refreshAfterSeconds;
        c.showTimeout = showTimeout;
        c.consent = consent;
        c.test = test;
        c.log = log;
        return c;
    }
}
