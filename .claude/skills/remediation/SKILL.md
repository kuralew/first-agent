---
name: remediation
description: Fixes issues found by /code-review, /security-review, or external security scanners (GitLeaks, SonarQube, Dependabot). Use when applying a fix to a reported finding, whether from an internal review or an external pipeline scan.
version: "0.1"
---

## Fix Logic
- Apply the appropriate fix based on the issue type in $ARGUMENTS.
- If $ARGUMENTS includes code context (line, componentName, file), it's reported by /code-review or /security-review and then auto fix
- If $ARGUMENTS is a raw description of an error, it's from an external pipeline. Get context from appropriate file in the repository and fix it. If there is not enough context, ask the developer for more information. 
- Always ask the developer for approval before applying any fix, whether internal or external
- For code quality findings, read @code-review-remediation-logic.md
- For security findings, read @security-remediation-logic.md

## Outcome Report
- Generate a report for each reported issue. 

**Finding #[n]**
- Issue: [The issue that was found and needed fixing]
- File: [fileName]
- Line: [lineNumber]
- Fix: [What was changed]
- Dev Input: [If more context was provided by the developer]
- Type: [internal or external]
- Status: [Fixed | Pending Approval | Requires Manual Fix]

