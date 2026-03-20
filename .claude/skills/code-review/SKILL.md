---
name: code-review
description: Reviews code changes for quality, standards compliance, naming conventions, error handling, and test coverage gaps. Use when a developer is about to commit, when asked to review a diff, or when asked to check code against team standards. Do NOT trigger for security vulnerability scanning — that is handled by /security-review.
version: "0.1"
---

## Standard Reference
This review enforces team-specific standards in addition to general frontend best practices.
Read @../team-standards/SKILL.md for the full list of team overrides.

## Coding Standard
- Each component lives in its own file
- Business logic is extracted into a separate file
- Presentation components must not make API calls
- Components that make API calls must be named <Name>Container

## Tests
- Make sure each component has a test file associated with it that tests each functionality of a component. If it's API Container component, make sure data is mocked and API call is simulated.

## Review Process
- Run `git diff origin/main...HEAD` to get the current diff
- Review every file in the diff against the standards in this skill
- Review every file against the team overrides in @../team-standards/SKILL.md

## Actions after Review
- For simple, mechanical issues: apply the fix using @../remediation/remediation-logic.md and ask the user for approval before applying
- For complex issues or business logic violations: report the finding with a clear explanation and recommended approach — leave the fix to the developer

## Outcome Report

Generate a report at the end of the review using the following structure for each finding:

**Finding #[n]**
- File: [fileName]
- Component: [componentName]  
- Line: [lineNumber]
- Severity: [Low | Medium | High]
- Issue: [description of the violation]
- Code: [snippet showing the problem]
- Fix: [what was changed or what needs to change]
- Status: [Fixed | Pending Approval | Requires Manual Fix]