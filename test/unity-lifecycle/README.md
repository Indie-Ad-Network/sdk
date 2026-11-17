# Unity lifecycle bridge checks

Run from the repository root with .NET SDK 8 or newer:

```sh
dotnet run --project test/unity-lifecycle/Lifecycle.csproj
```

This executes the production `IndieAds.cs` against fake Unity/native/web-view boundaries, without opening Unity. It covers idle/loading/presented shutdown, repeat calls, destruction, stale and batched messages, event retention/order, callback reinitialization, pending consent remakes, listener isolation, sleep restoration, store cleanup requests, loading/visible More games teardown and late callbacks, and throwing subscribers/web views. It does not compile against Unity or execute iOS/Android native code; confirm native dismissal and playback in the GUI editor/device builds.
