# Architecture Review Checklist

- Are control plane and data plane responsibilities still separated?
- Is there exactly one archive truth model?
- Did a new feature smuggle direct disk logic into the web/API layer?
- Does the new storage capability fit the provider abstraction cleanly?
- Is delete/cleanup still a distinct policy path?
- Did we create ambiguous states or hidden transitions?
- Are transition states documented for positive, negative, and dependency edge cases?
- Does motion support clarity instead of hiding or overstating system state?
- Is reduced-motion behavior defined for the new flow or screen?
