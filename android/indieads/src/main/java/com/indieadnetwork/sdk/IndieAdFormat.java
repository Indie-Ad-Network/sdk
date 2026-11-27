package com.indieadnetwork.sdk;

public enum IndieAdFormat {
    /** The player's choice; watching to the end of the countdown earns the game's reward. */
    REWARDED,
    /** The game's choice, between two things the player was doing: no reward, and a way out by the placement's minSecs. */
    INTERSTITIAL,
}
