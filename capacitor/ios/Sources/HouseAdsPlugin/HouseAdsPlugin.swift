import Capacitor
import Foundation
import Network
import StoreKit
import UIKit

/// house-ads' native side on iOS (capacitor/index.js says what each call is for).
@objc(HouseAdsPlugin)
public class HouseAdsPlugin: CAPPlugin, CAPBridgedPlugin, SKStoreProductViewControllerDelegate {
    public let identifier = "HouseAdsPlugin"
    public let jsName = "HouseAds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openStore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "network", returnType: CAPPluginReturnPromise)
    ]

    private let monitor = NWPathMonitor()
    /// The call that opened the sheet, answered when the sheet is put away.
    private var sheetCall: CAPPluginCall?

    override public func load() {
        monitor.start(queue: DispatchQueue.global(qos: .utility))
    }

    deinit {
        monitor.cancel()
    }

    /// `id` (with `ct`, `pt`): the App Store sheet over the game, resolving once it's dismissed.
    /// Without an id, or if the sheet can't load the product: `url`, then `fallback`, opened
    /// outside the app, resolving at once.
    @objc func openStore(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = Int(call.getString("id") ?? ""), self.sheetCall == nil, let presenter = self.topViewController() else {
                self.openOutside(call)
                return
            }
            var product: [String: Any] = [SKStoreProductParameterITunesItemIdentifier: NSNumber(value: id)]
            if let ct = call.getString("ct") { product[SKStoreProductParameterCampaignToken] = ct }
            if let pt = call.getString("pt") { product[SKStoreProductParameterProviderToken] = pt }

            let sheet = SKStoreProductViewController()
            sheet.delegate = self
            self.sheetCall = call
            sheet.loadProduct(withParameters: product) { [weak sheet] loaded, _ in
                guard !loaded, self.sheetCall === call else { return }
                // no such product, or no network: the sheet away, and the link the ordinary way
                self.sheetCall = nil
                sheet?.dismiss(animated: true) { self.openOutside(call) }
            }
            presenter.present(sheet, animated: true)
        }
    }

    public func productViewControllerDidFinish(_ viewController: SKStoreProductViewController) {
        viewController.dismiss(animated: true)
        sheetCall?.resolve()
        sheetCall = nil
    }

    private func openOutside(_ call: CAPPluginCall) {
        let urls = [call.getString("url"), call.getString("fallback")].compactMap { $0 }.compactMap { URL(string: $0) }
        guard let first = urls.first else {
            call.reject("no url")
            return
        }
        UIApplication.shared.open(first, options: [:]) { opened in
            if opened || urls.count < 2 {
                call.resolve()
            } else {
                UIApplication.shared.open(urls[1], options: [:]) { _ in call.resolve() }
            }
        }
    }

    private func topViewController() -> UIViewController? {
        var top = bridge?.viewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }

    /// `metered`: cellular, a personal hotspot, or Low Data Mode.
    @objc func network(_ call: CAPPluginCall) {
        let path = monitor.currentPath
        call.resolve(["metered": path.isExpensive || path.isConstrained])
    }
}
