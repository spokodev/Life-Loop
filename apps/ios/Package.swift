// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "LifeLoopiOS",
  platforms: [
    .iOS(.v17),
    .macOS(.v14)
  ],
  products: [
    .library(
      name: "LifeLoopiOS",
      targets: ["LifeLoopiOS"]
    )
  ],
  targets: [
    .target(
      name: "LifeLoopiOS"
    ),
    .testTarget(
      name: "LifeLoopiOSTests",
      dependencies: ["LifeLoopiOS"]
    )
  ]
)
