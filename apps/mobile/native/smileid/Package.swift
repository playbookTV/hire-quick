// swift-tools-version: 6.0
import PackageDescription

// Same verified v12.1.0 binaries as smileidentity/ios-spm, without its optional
// Sentry adapter. @sentry/react-native owns HireQuick's native Sentry library.
let package = Package(
    name: "HireQuickSmileID",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "UseSmileIDBridge", targets: ["UseSmileIDBridge", "UseSmileIDKameraSupport"]),
        .library(name: "UseSmileIDVisionFace", targets: ["UseSmileIDVisionFace", "UseSmileIDBridge", "UseSmileIDKameraSupport"]),
    ],
    dependencies: [
        .package(url: "https://github.com/smileidentity/kamera-spm", exact: "1.0.5"),
    ],
    targets: [
        .binaryTarget(
            name: "UseSmileIDBridge",
            url: "https://github.com/smileidentity/ios-spm/releases/download/v12.1.0/UseSmileIDBridge.xcframework.zip",
            checksum: "3b43de5b7487b943ab974ec41ae81886254dc2f2be6d1c358caf6c911551c27e"
        ),
        .binaryTarget(
            name: "UseSmileIDVisionFace",
            url: "https://github.com/smileidentity/ios-spm/releases/download/v12.1.0/UseSmileIDVisionFace.xcframework.zip",
            checksum: "8f7d0f0fb2c4cfff92d50b8bf78fa74e44879a78798ee691b18197f941c063de"
        ),
        .target(
            name: "UseSmileIDKameraSupport",
            dependencies: [.product(name: "Kamera", package: "kamera-spm")]
        ),
    ]
)
