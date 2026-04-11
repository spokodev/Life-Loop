import Foundation
import SwiftUI

public enum MobileAssetStatus: String, Codable, CaseIterable, Sendable {
  case uploaded
  case staged
  case archiving
  case verified
  case blocked

  public var label: String {
    switch self {
    case .uploaded:
      "Uploaded"
    case .staged:
      "Staged"
    case .archiving:
      "Archiving"
    case .verified:
      "Verified"
    case .blocked:
      "Blocked"
    }
  }

  public var safetyCopy: String {
    switch self {
    case .uploaded:
      "Upload finished, but this is not archive safety."
    case .staged:
      "Temporary hosted staging is waiting for archive placement."
    case .archiving:
      "The desktop archive flow still needs to verify primary and replica placement."
    case .verified:
      "Archive evidence exists. Cleanup still requires explicit manual review."
    case .blocked:
      "The item needs review. Nothing should be deleted."
    }
  }

  var tint: Color {
    switch self {
    case .uploaded, .staged:
      .blue
    case .archiving:
      .orange
    case .verified:
      .green
    case .blocked:
      .red
    }
  }
}
