import Foundation
import Testing

@testable import LifeLoopiOS

@Test func reservationRequestUsesDeviceCredentialAndJsonBody() throws {
  let coordinator = StagingUploadCoordinator(
    apiBaseURL: try #require(URL(string: "https://api.life-loop.test")),
    deviceCredential: "device-secret"
  )
  let request = try coordinator.makeReservationRequest(
    StagingReservationRequest(
      libraryId: "library-id",
      filename: "IMG_0001.JPG",
      contentType: "image/jpeg",
      checksumSha256: String(repeating: "a", count: 64),
      sizeBytes: 12
    )
  )

  #expect(request.url?.absoluteString == "https://api.life-loop.test/v1/mobile/staging/reservations")
  #expect(request.httpMethod == "POST")
  #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer device-secret")
  #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
  #expect(request.httpBody?.isEmpty == false)
}

@Test func uploadRequestRejectsNonPutDirectives() throws {
  let coordinator = StagingUploadCoordinator(
    apiBaseURL: try #require(URL(string: "https://api.life-loop.test")),
    deviceCredential: "device-secret"
  )
  let directive = UploadDirective(
    method: "POST",
    url: try #require(URL(string: "https://api.life-loop.test/upload")),
    expiresAt: "2026-04-11T00:00:00Z"
  )

  #expect(throws: StagingUploadCoordinatorError.invalidUploadMethod("POST")) {
    try coordinator.makeUploadRequest(directive: directive, contentType: "image/jpeg")
  }
}

@Test func mobileStatusesKeepUploadedSeparateFromVerified() {
  #expect(MobileAssetStatus.uploaded.safetyCopy.contains("not archive safety"))
  #expect(MobileAssetStatus.verified.safetyCopy.contains("Cleanup still requires explicit manual review"))
}
