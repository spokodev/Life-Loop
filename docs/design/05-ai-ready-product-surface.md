# AI-Ready Product Surface

## Near-term rule
Do not add AI until core archive state is trustworthy.

## Future-safe design decisions
- actions and states use structured labels
- event and job history are machine-readable
- UI components are open-code and predictable
- terminology is stable enough for AI assistants to explain safely

## Candidate future AI features
- explain why an item is not cleanup-safe
- suggest replica repair steps
- summarize archive health anomalies
- help classify storage topology during onboarding

## Guardrail
AI suggestions must never execute destructive actions automatically.
