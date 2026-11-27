package com.indieadnetwork.sdk;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.Locale;

/**
 * What IndieAds says to the page (web/host.js), as text: plain Java, nothing of Android's, so it's tested on the JVM
 * (src/test). The Unity package's IndieAds.cs says the same things the same way.
 */
final class Wire {

    private Wire() {}

    private static final char LINE_SEPARATOR = ' ', PARAGRAPH_SEPARATOR = ' ';   // end a line in JavaScript, though not in JSON

    /** `s` as a JavaScript string literal, or null. */
    static String quote(String s) {
        if (s == null) return "null";
        StringBuilder quoted = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') {
                quoted.append('\\').append(c);
            } else if (c < ' ' || c == LINE_SEPARATOR || c == PARAGRAPH_SEPARATOR || c == '<') {
                // '<' too: nothing here may end a script or start a tag, wherever it's put
                quoted.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            } else {
                quoted.append(c);
            }
        }
        return quoted.append('"').toString();
    }

    /** A number as JavaScript reads it, whatever the device's locale: 2.5, not 2,5; 5, not 5.0. */
    static String number(double d) {
        if (d == Math.rint(d) && Math.abs(d) < 1e15) return Long.toString((long) d);
        return Double.toString(d);
    }

    /** The argument of indieAdsHost.start(). `wide`: the game's screen is wider than tall. */
    static String startConfig(IndieAdsConfig config, String key, boolean wide) {
        String shipped = config.shippedCatalogueJson;
        StringBuilder json = new StringBuilder(256 + (shipped != null ? shipped.length() : 0));
        json.append("{\"key\":").append(quote(key));
        json.append(",\"lang\":").append(quote(config.language));
        json.append(",\"host\":").append(quote(config.host));
        json.append(",\"rating\":").append(quote(config.rating));
        json.append(",\"os\":\"android\"");
        json.append(",\"catalogue\":").append(quote(config.catalogueUrl));
        json.append(",\"ingest\":").append(quote(config.ingestUrl));
        json.append(",\"reports\":").append(quote(config.reportUrl));
        json.append(",\"mix\":").append(quote(config.mixUrl));
        json.append(",\"signedBy\":").append(quote(config.catalogueKey));
        json.append(",\"age\":").append(config.age > 0 ? Integer.toString(config.age) : "null");
        json.append(",\"test\":").append(config.test);
        json.append(",\"consent\":").append(config.consent);
        json.append(",\"wide\":").append(wide);   // the page can't see its own shape until it's shown
        json.append(",\"placements\":{");
        IndieAdPlacement[] placements = config.placements != null ? config.placements : new IndieAdPlacement[0];
        for (int i = 0; i < placements.length; i++) {
            IndieAdPlacement p = placements[i];
            boolean interstitial = p.format == IndieAdFormat.INTERSTITIAL;
            json.append(i > 0 ? "," : "").append(quote(p.id)).append(":{\"format\":").append(interstitial ? "\"interstitial\"" : "\"rewarded\"");
            if (p.maxSecs > 0) json.append(",\"maxSecs\":").append(p.maxSecs);
            if (p.minSecs >= 0) json.append(",\"minSecs\":").append(number(p.minSecs));
            if (interstitial) json.append(",\"skipAfter\":").append(number(p.skipAfter));
            if (p.reward != null && !p.reward.isEmpty()) json.append(",\"reward\":").append(quote(p.reward));
            json.append("}");
        }
        // the shipped catalogue is JSON already, and JSON is JavaScript
        json.append("},\"shipped\":").append(shipped == null ? "null" : shipped);   // IndieAds has made a blank one null
        return json.append("}").toString();
    }

    /**
     * The address of the page of games this one shows, from a catalogue's `more`, as core/index.js moreGamesAt has it:
     * null with none, and for a player under 13 (`age` 0: not known). Only an https address ending in a /, as
     * core/catalogue.js takes it: a game's id after it is a page of that site's and no other's.
     */
    static String moreGames(String more, String host, int age) {
        if (more == null || !more.matches("https://\\S+/") || host == null || (age > 0 && age < 13)) return null;
        try {
            return more + URLEncoder.encode(host, "UTF-8").replace("+", "%20");   // as encodeURIComponent has a space
        } catch (UnsupportedEncodingException e) {
            throw new AssertionError(e);
        }
    }

    /**
     * The origin of the catalogue's address, which is the page's: where its storage and downloads are kept. Throws
     * IllegalArgumentException for one that isn't an address (IndieAds.init says so to the game).
     */
    static String origin(String catalogueUrl) {
        return URI.create(catalogueUrl).resolve("/").toString();
    }

    /** As core/storeLinks.js campaignOf: the referrer's utm_campaign, where its utm_medium is the network's ("house"). */
    static String campaignOf(String referrer) {
        if (referrer == null || referrer.isEmpty()) return null;
        String medium = null, campaign = null;
        for (String pair : referrer.split("&")) {
            int at = pair.indexOf('=');
            String key = decode(at < 0 ? pair : pair.substring(0, at));
            String value = at < 0 ? "" : decode(pair.substring(at + 1));
            if (key.equals("utm_medium") && medium == null) medium = value;
            else if (key.equals("utm_campaign") && campaign == null) campaign = value;
        }
        return "house".equals(medium) && campaign != null && !campaign.isEmpty() ? campaign : null;
    }

    private static String decode(String s) {
        try {
            return URLDecoder.decode(s, "UTF-8");
        } catch (IllegalArgumentException e) {   // a stray %: taken as it is, as Uri.UnescapeDataString does
            return s.replace('+', ' ');
        } catch (UnsupportedEncodingException e) {
            throw new AssertionError(e);
        }
    }
}
