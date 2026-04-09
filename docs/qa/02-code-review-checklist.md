# Code Review Checklist

- idempotent job logic
- explicit state transitions
- checksum verification where needed
- atomic writes for durable file placement
- retry safety
- no secrets in logs
- no unsafe implicit deletion
- good error classification
- observability hooks present
- transition-state components do not collapse distinct states into one generic loading or error state
- reduced-motion support exists where animated UI was added
- animation code prefers transform/opacity and avoids unnecessary layout thrash
