# AgentShield private pilot feedback (manual; opt-in only)

Do not send source code, credentials or customer data in feedback. Pilot participants must consent and be explicitly invited by the owner.

Session date (optional): ______
OS and Node major version: ______
Claude Code version: ______
Using demo or developer-owned sample project? ______
Mode: Monitor / Assist / Auto-fix

1. Could you install and uninstall without help? (yes/no; obstacles)
2. Minutes from first command to first successful scan: ______
3. Did a real Claude Code edit trigger the PostToolUse hook? (yes/no/unknown)
4. Did a Bash-created untracked file trigger the final gate? (yes/no/unknown)
5. Were the findings understandable and relevant? (1-5 + example rule IDs)
6. Did you see a likely false positive? Supply a *sanitized description*, not source.
7. Did the workflow miss a risk independently verified elsewhere? Describe category, without sensitive source.
8. Were repair suggestions safe and minimal? (1-5)
9. Did Auto-fix respect Claude's normal permission prompts? (yes/no/not tested)
10. Did the scanner ever fail, hang, or show an incomplete scan? (yes/no; sanitized diagnostic)
11. Did uninstall preserve unrelated .claude settings? (yes/no)
12. What would prevent you from using AgentShield again? ______

Optional manual metrics:
- install success; first scan success; hook error count; scanner elapsed times; findings by severity
- externally reviewed false positives/negatives; bounded repair outcomes; review time

No remote telemetry, automatic feedback submission, or participant outreach is provided.
