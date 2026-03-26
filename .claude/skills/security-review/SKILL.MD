---
name: security-review
description: Reviews code changes for security vulnerabilities including injection risks, authentication flaws, exposed secrets, missing authorization, and insecure configurations. Use when a developer is about to commit, when reviewing a diff for security issues, or when asked to perform a security audit.Do NOT use for code quality or standards checks — use /code-review for that.
version: "0.1"
---

## Review Process
- Run `git diff origin/main...HEAD` to get the current diff
- Review every file in the diff against the Security Checklist below
- If $ARGUMENTS is provided, review the specific file or finding passed in

## Security Checklist

### A01 — Broken Access Control
- Check that protected React routes verify authentication state before 
  rendering — unauthenticated users should be redirected to login, 
  not just shown an empty page
- Check every .NET API endpoint has [Authorize] attribute unless explicitly 
  intended to be public
- Check that users can only access their own data — look for queries that 
  use user-supplied IDs without verifying ownership
  (e.g. /api/cases/123 should verify case 123 belongs to the requesting user)
- Check for missing role-based checks on sensitive endpoints
  (e.g. only attorneys should access certain case documents)

### A02 — Cryptographic Failures
- Check for hardcoded secrets, API keys, passwords, or connection strings 
  in source code or config files
- Check that appsettings.json does not contain production secrets — 
  they should be in Azure Key Vault
- Check that sensitive data (SSNs, case details) is not logged or exposed 
  in error messages
- Check that passwords are never stored or transmitted in plain text

### A03 — Injection
- Check .NET repository layer for raw SQL string concatenation —
  all queries must use Entity Framework or parameterized queries
- Check React components for XSS risks — user-supplied data must never 
  be rendered via dangerouslySetInnerHTML without sanitization. 
  Prefer safe React rendering patterns instead.
- Check that user input from [FromBody], [FromQuery], [FromRoute] is 
  validated before use
- Check that URL parameters are not directly injected into the DOM 
  without encoding

### A04 — Insecure Design  
- Check that sensitive operations (delete, bulk export) require 
  confirmation and are not exposed via GET requests
- Check that file uploads validate file type and size on the server side,
  not just the client side — critical for a law firm handling documents
- Check that pagination is enforced on list endpoints — never return 
  unbounded result sets

### A05 — Security Misconfiguration
- Check that CORS in Program.cs does not use AllowAnyOrigin() in 
  production configuration
- Check that detailed error messages and stack traces are disabled 
  in production
- Check that no unnecessary HTTP methods are enabled on endpoints
  (e.g. DELETE enabled on endpoints that should be read-only)
- Check that Azure App Service environment variables do not contain 
  secrets that should be in Key Vault

### A06 — Vulnerable and Outdated Components

#### npm (Frontend)
- Run `npm audit --audit-level=high` — catches known CVEs. Critical 
  and high severity must be fixed before commit, moderate must be 
  flagged for review
- Run `socket scan .` — catches supply chain attacks, typosquatting, 
  suspicious publishers, behavioral risks, and compromised maintainer 
  accounts. Any flagged package must be reviewed before commit.
- For every new package added in the diff, manually verify:
  - No dependency confusion risk — internal package names must not 
    be resolvable from the public npm registry
  - No `file:` or `git:` protocol version pins — these bypass 
    vulnerability scanning entirely
  - No unusual post-install scripts in package.json — these can 
    execute malicious code during npm install

#### NuGet (.NET Backend)
- Run `dotnet list package --vulnerable` — catches known CVEs in 
  NuGet packages. Critical and high severity must be fixed before 
  commit, moderate must be flagged for review
- For every new NuGet package added in the diff, manually verify:
  - Package exists on the official NuGet gallery (nuget.org)
  - Package has recent maintenance activity — no updates in 2+ 
    years is a risk
  - Package download count is not suspiciously low — extremely low 
    counts on new packages indicate a potential typosquatting attack
  - Package name contains no typosquat patterns — check for 
    Cyrillic or non-ASCII characters (e.g. `Newtonsoft.Jsон` vs 
    `Newtonsoft.Json`)
  - Package publisher is established — recently created publisher 
    accounts on widely used packages are a red flag
  - Package is signed — unsigned packages from unknown publishers 
    should be flagged
  - No dependency confusion risk — internal NuGet packages hosted 
    on Azure Artifacts must not be resolvable from nuget.org
  - NuGet.Config has not been modified — changes could redirect 
    package resolution to a malicious source
  - No local file path references (`<HintPath>`) unless explicitly 
    justified — these bypass NuGet vulnerability scanning
    
### A07 — Authentication Failures
- Check that MSAL.js authentication is not bypassed or misconfigured
  in React — verify that protected routes check auth state before rendering
- Check that JWT tokens are validated properly on the .NET side
- Check that there are no hardcoded test credentials or bypass flags 
  left in code
- Check that session tokens and JWT tokens are not stored in 
  localStorage or sessionStorage — tokens must use httpOnly cookies

### A08 — Software and Data Integrity
- Check that CI/CD pipeline files (azure-pipelines.yml or 
  .github/workflows) have not been modified to skip security steps
- Check that third party scripts are not added to the frontend without 
  a clear justification
- Check that npm scripts in package.json have not been modified to 
  run unexpected commands

### A09 — Security Logging Failures
- Check that authentication events (login, logout, failed attempts) 
  are logged
- Check that sensitive operations (document access, case updates) 
  produce audit log entries
- Check that logs do not contain sensitive data such as passwords, 
  tokens, or personal information
- Check that console.log statements do not output sensitive data 
  such as tokens, user details, or case information — these are 
  visible to anyone with browser dev tools open

### A10 — Server Side Request Forgery
- Check that any server-side HTTP calls do not use URLs supplied 
  directly by the user without validation
- Check that internal Azure service URLs are not constructable from 
  user input

## Actions After Review
- For every finding, classify severity as CRITICAL, HIGH, MEDIUM, or LOW
- For CRITICAL and HIGH: block the commit, apply fix using 
  @../remediation/security-remediation-logic.md, ask developer for approval
- For MEDIUM: propose fix, require developer acknowledgment
- For LOW: include in report only, developer decides when to fix
- Generate Outcome Report at the end

## Outcome Report

**Finding #[n]**
- OWASP Category: [A01–A10 with name]
- Severity: [CRITICAL | HIGH | MEDIUM | LOW]
- File: [fileName]
- Line: [lineNumber]
- Issue: [description of the vulnerability]
- Code: [snippet showing the vulnerable pattern]
- Fix: [what was changed or what needs to change]
- Status: [Fixed | Pending Approval | Requires Manual Fix | Escalated]

**Review Summary**
- Total findings: [n]
- CRITICAL: [n] — Commit blocked: [Yes | No]
- HIGH: [n] — Commit blocked: [Yes | No]  
- MEDIUM: [n]
- LOW: [n]
- Overall status: [PASS | FAIL]
  - PASS = zero CRITICAL and zero HIGH findings
  - FAIL = one or more CRITICAL or HIGH findings