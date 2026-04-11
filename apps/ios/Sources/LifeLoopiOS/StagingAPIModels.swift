import Foundation

public struct StagingReservationRequest: Codable, Equatable, Sendable {
  public let libraryId: String
  public let filename: String
  public let contentType: String?
  public let checksumSha256: String
  public let sizeBytes: Int64

  public init(
    libraryId: String,
    filename: String,
    contentType: String?,
    checksumSha256: String,
    sizeBytes: Int64
  ) {
    self.libraryId = libraryId
    self.filename = filename
    self.contentType = contentType
    self.checksumSha256 = checksumSha256
    self.sizeBytes = sizeBytes
  }
}

public struct StagingReservationResponse: Decodable, Equatable, Sendable {
  public let stagingObject: HostedStagingObject
  public let upload: UploadDirective
}

public struct HostedStagingObject: Decodable, Equatable, Sendable {
  public let id: String
  public let libraryId: String
  public let deviceId: String
  public let status: String
  public let filename: String
  public let contentType: String?
  public let checksumSha256: String
  public let sizeBytes: Int64
  public let uploadedBytes: Int64
  public let expiresAt: String
  public let completedAt: String?
  public let blockedReason: String?
  public let safeErrorClass: String?
}

public struct UploadDirective: Decodable, Equatable, Sendable {
  public let method: String
  public let url: URL
  public let expiresAt: String
}
