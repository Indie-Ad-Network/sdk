package com.indieadnetwork.sdk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

// What's said to the page, as the Unity package's IndieAds.cs says it.
public class WireTest {

    @Test public void quotesForJavaScript() {
        assertEquals("null", Wire.quote(null));
        assertEquals("\"plain\"", Wire.quote("plain"));
        assertEquals("\"a\\\"b\\\\c\"", Wire.quote("a\"b\\c"));
        assertEquals("\"\\u000a\\u2028\\u2029\"", Wire.quote("\n\u2028\u2029"));
        assertEquals("\"\\u003c/script>\"", Wire.quote("</script>"));   // nothing may end the page's script
        assertEquals("\"Gagné: 100 🪙\"", Wire.quote("Gagné: 100 🪙"));
    }

    @Test public void numbersAsJavaScriptReadsThem() {
        assertEquals("5", Wire.number(5));
        assertEquals("2.5", Wire.number(2.5));
        assertEquals("0", Wire.number(0));
    }

    @Test public void theStartConfig() {
        IndieAdsConfig c = new IndieAdsConfig();
        c.host = "duet";
        c.catalogueUrl = "https://indieadnetwork.com/catalogue.json";
        c.placements = new IndieAdPlacement[] {
            IndieAdPlacement.rewarded("FreeCoins").reward("100 coins"),
            IndieAdPlacement.interstitial("LevelEnd").minSecs(2.5),
            IndieAdPlacement.rewarded("Any").maxSecs(0),
        };
        c.age = 12;
        c.shippedCatalogueJson = "{\"version\":1}";
        c.language = "fr";
        assertEquals("{\"key\":\"k1\",\"lang\":\"fr\",\"host\":\"duet\",\"rating\":null,\"os\":\"android\","
                + "\"catalogue\":\"https://indieadnetwork.com/catalogue.json\",\"ingest\":null,\"reports\":null,\"mix\":null,\"signedBy\":null,"
                + "\"age\":12,\"test\":false,\"consent\":true,\"wide\":true,\"placements\":{"
                + "\"FreeCoins\":{\"format\":\"rewarded\",\"maxSecs\":30,\"reward\":\"100 coins\"},"
                + "\"LevelEnd\":{\"format\":\"interstitial\",\"maxSecs\":30,\"minSecs\":2.5,\"skipAfter\":5},"
                + "\"Any\":{\"format\":\"rewarded\"}},\"shipped\":{\"version\":1}}",
                Wire.startConfig(c, "k1", true));
        c.shippedCatalogueJson = null;   // a blank one IndieAds makes null as it starts
        c.language = null;
        c.placements = null;
        c.age = 0;
        assertEquals(true, Wire.startConfig(c, "k", false).endsWith("\"age\":null,\"test\":false,\"consent\":true,\"wide\":false,\"placements\":{},\"shipped\":null}"));
    }

    // As core/index.js moreGamesAt: for a device with no web view, where no page will say it
    @Test public void thePageOfMoreGames() {
        assertEquals("https://indieadnetwork.com/games/duet", Wire.moreGames("https://indieadnetwork.com/games/", "duet", 0));
        assertEquals("https://x.test/g/my%20game", Wire.moreGames("https://x.test/g/", "my game", 13));
        assertNull(Wire.moreGames("https://indieadnetwork.com/games/", "duet", 12));   // not for a child
        assertNull(Wire.moreGames(null, "duet", 0));
        assertNull(Wire.moreGames("", "duet", 0));
        assertNull(Wire.moreGames("http://indieadnetwork.com/games/", "duet", 0));   // https only
        assertNull(Wire.moreGames("https://indieadnetwork.com/games", "duet", 0));   // and ending in a /
    }

    @Test public void thePageOrigin() {
        assertEquals("https://indieadnetwork.com/", Wire.origin("https://indieadnetwork.com/catalogue.json"));
        assertEquals("https://play.example.com:8443/", Wire.origin("https://play.example.com:8443/a/b/catalogue.json?x=1"));
    }

    // As test/storeLinks.test.mjs has core/storeLinks.js campaignOf
    @Test public void theCampaignOfAReferrer() {
        assertEquals("ian", Wire.campaignOf("utm_source=tcw&utm_medium=house&utm_campaign=ian"));
        assertEquals("spring sale", Wire.campaignOf("utm_medium=house&utm_campaign=spring+sale"));
        assertEquals("a/b", Wire.campaignOf("utm_campaign=a%2Fb&utm_medium=house"));
        assertEquals("first", Wire.campaignOf("utm_medium=house&utm_campaign=first&utm_campaign=second"));
        assertNull(Wire.campaignOf("utm_source=google-play&utm_medium=organic"));
        assertNull(Wire.campaignOf("utm_medium=house"));
        assertNull(Wire.campaignOf("utm_medium=house&utm_campaign="));
        assertNull(Wire.campaignOf(""));
        assertNull(Wire.campaignOf(null));
        assertEquals("100%", Wire.campaignOf("utm_medium=house&utm_campaign=100%"));
    }
}
