package storage

type Provider interface {
	Put() error
	Get() error
	Verify() error
	List() error
	Delete() error
	Health() error
	Capabilities() []string
}

type LocalDiskProvider struct{}

// TODO(mvp-deferred): Add concrete provider implementations for external drives, S3-compatible storage, SMB, and WebDAV.
func (LocalDiskProvider) Put() error    { return nil }
func (LocalDiskProvider) Get() error    { return nil }
func (LocalDiskProvider) Verify() error { return nil }
func (LocalDiskProvider) List() error   { return nil }
func (LocalDiskProvider) Delete() error { return nil }
func (LocalDiskProvider) Health() error { return nil }

func (LocalDiskProvider) Capabilities() []string {
	return []string{"atomic-write", "checksum-verify"}
}
