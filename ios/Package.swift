// swift-tools-version:5.9
// The native iOS SDK as a local Swift package (File › Add Package Dependencies… › Add Local…, this folder), for a game
// that would rather not drag IndieAds/ in. Objective-C; IndieAds.h is its whole API.
import PackageDescription

let package = Package(
    name: "IndieAds",
    platforms: [.iOS(.v15)],
    products: [.library(name: "IndieAds", targets: ["IndieAds"])],
    targets: [
        .target(
            name: "IndieAds",
            path: "IndieAds",
            resources: [.copy("IndieAdsPlayer.html"), .copy("PrivacyInfo.xcprivacy")],
            publicHeadersPath: "include",
            linkerSettings: [.linkedFramework("WebKit"), .linkedFramework("StoreKit")]
        ),
    ]
)
