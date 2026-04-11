import SwiftUI

#if canImport(PhotosUI)
  import PhotosUI
#endif

public struct MobileIngestView: View {
  @State private var selectedItem: PhotosPickerItem?
  @State private var status: MobileAssetStatus = .staged

  public init() {}

  public var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 20) {
        VStack(alignment: .leading, spacing: 8) {
          Text("Life-Loop Ingest")
            .font(.largeTitle.weight(.semibold))
          Text("Upload to temporary staging first. Staged does not mean archived or safe to delete.")
            .font(.body)
            .foregroundStyle(.secondary)
        }

        statusCard

        #if canImport(PhotosUI)
          PhotosPicker(
            selection: $selectedItem,
            matching: .any(of: [.images, .videos]),
            photoLibrary: .shared()
          ) {
            Label("Choose photo or video", systemImage: "photo.on.rectangle.angled")
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)
          .onChange(of: selectedItem) { _, newValue in
            status = newValue == nil ? .staged : .uploaded
          }
        #else
          Text("PhotosPicker is unavailable on this platform.")
            .foregroundStyle(.secondary)
        #endif

        Text("Next: reserve hosted staging, upload in the background, then wait for archive and restore evidence.")
          .font(.footnote)
          .foregroundStyle(.secondary)

        Spacer()
      }
      .padding()
      .navigationTitle("Ingest")
    }
  }

  private var statusCard: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Circle()
          .fill(status.tint)
          .frame(width: 10, height: 10)
        Text(status.label)
          .font(.headline)
      }
      Text(status.safetyCopy)
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding()
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
  }
}

#Preview {
  MobileIngestView()
}
