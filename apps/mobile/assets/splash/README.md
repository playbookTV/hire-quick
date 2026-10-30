# HireQuick launch artwork

`lockup.png` is a transparent 544 × 544 export (4× a 136 pt square) of the approved Wonder splash lockup. It reuses the official SVGs in `../welcome/`, with a 79 pt brand tile, a 24 pt gap, and the locally bundled Archivo Bold wordmark at 24 pt with −0.5 pt tracking. The wordmark uses `#F4F2ED`; the native splash background in `app.json` uses the existing neutral/950 token value, `#17181A`.

The Expo splash plugin consumes the PNG at 136 pt width in light and dark modes. `LaunchScreen` and `BrandMark` reproduce the same lockup while the app restores authentication. Keep this asset, the plugin configuration, and those components in sync. Native splash configuration requires a new iOS/Android build; an OTA JavaScript update alone cannot update it.
