import Foundation

public enum StagingUploadCoordinatorError: Error, Equatable {
  case invalidUploadMethod(String)
}

public final class StagingUploadCoordinator: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let apiBaseURL: URL
  private let deviceCredential: String
  private let encoder: JSONEncoder
  private let session: URLSession

  public init(
    apiBaseURL: URL,
    deviceCredential: String,
    backgroundIdentifier: String = "dev.life-loop.ios.staging-upload",
    encoder: JSONEncoder = JSONEncoder()
  ) {
    self.apiBaseURL = apiBaseURL
    self.deviceCredential = deviceCredential
    self.encoder = encoder
    let configuration = URLSessionConfiguration.background(withIdentifier: backgroundIdentifier)
    configuration.sessionSendsLaunchEvents = true
    configuration.waitsForConnectivity = true
    self.session = URLSession(configuration: configuration, delegate: nil, delegateQueue: nil)
    super.init()
  }

  public func makeReservationRequest(_ reservation: StagingReservationRequest) throws -> URLRequest {
    var request = URLRequest(url: apiBaseURL.appending(path: "/v1/mobile/staging/reservations"))
    request.httpMethod = "POST"
    request.addValue("Bearer \(deviceCredential)", forHTTPHeaderField: "Authorization")
    request.addValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try encoder.encode(reservation)
    return request
  }

  public func makeUploadRequest(
    directive: UploadDirective,
    contentType: String?
  ) throws -> URLRequest {
    guard directive.method == "PUT" else {
      throw StagingUploadCoordinatorError.invalidUploadMethod(directive.method)
    }

    var request = URLRequest(url: directive.url)
    request.httpMethod = directive.method
    request.addValue("Bearer \(deviceCredential)", forHTTPHeaderField: "Authorization")

    if let contentType {
      request.addValue(contentType, forHTTPHeaderField: "Content-Type")
    }

    return request
  }

  public func makeBackgroundUploadTask(
    fileURL: URL,
    directive: UploadDirective,
    contentType: String?
  ) throws -> URLSessionUploadTask {
    let request = try makeUploadRequest(directive: directive, contentType: contentType)
    return session.uploadTask(with: request, fromFile: fileURL)
  }
}
