package bindings

type TargetReference struct {
	StorageTargetID string
	Provider        string
	Role            string
}

type ProviderMismatch struct {
	Target  TargetReference
	Binding StorageTargetBinding
}

type CoverageReport struct {
	Bound              []TargetReference
	Missing            []TargetReference
	Extra              []StorageTargetBinding
	ProviderMismatches []ProviderMismatch
}

func Coverage(bindingsFile File, targets []TargetReference) CoverageReport {
	report := CoverageReport{}
	targetsByID := map[string]TargetReference{}

	for _, target := range targets {
		targetsByID[target.StorageTargetID] = target

		binding, exists := bindingsFile.Find(target.StorageTargetID)
		if !exists {
			report.Missing = append(report.Missing, target)
			continue
		}

		if normalizeProvider(binding.Provider) != normalizeProvider(target.Provider) {
			report.ProviderMismatches = append(report.ProviderMismatches, ProviderMismatch{
				Target:  target,
				Binding: binding,
			})
			continue
		}

		report.Bound = append(report.Bound, target)
	}

	for _, binding := range bindingsFile.Bindings {
		if _, exists := targetsByID[binding.StorageTargetID]; !exists {
			report.Extra = append(report.Extra, binding)
		}
	}

	return report
}

func normalizeProvider(provider string) string {
	switch provider {
	case "LocalDiskProvider":
		return "local-disk"
	case "ExternalDriveProvider":
		return "external-drive"
	default:
		return provider
	}
}
