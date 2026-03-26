# Security Remediation Logic

## A01 — Broken Access Control
- If [Authorize] attribute is missing on a .NET endpoint: flag as 
  CRITICAL, propose adding [Authorize] with appropriate role
- If a protected React route renders without auth check: flag as 
  HIGH, propose adding auth guard
- If user-supplied ID is used without ownership verification: flag 
  as CRITICAL, propose adding ownership check to the query

## A02 — Cryptographic Failures
- If hardcoded secret, API key, or connection string found in code: 
  flag as CRITICAL, propose moving to Azure Key Vault reference
- If appsettings.json contains production secrets: flag as CRITICAL,
  propose Key Vault migration
- If sensitive data found in logs or error messages: flag as HIGH,
  propose removing or masking the sensitive fields
- If password stored or transmitted in plain text: flag as CRITICAL,
  propose hashing with bcrypt or ASP.NET Core Identity

## A03 — Injection
- If raw SQL string concatenation found in .NET repository layer: 
  flag as CRITICAL, propose Entity Framework equivalent or 
  parameterized query
- If dangerouslySetInnerHTML used with user-supplied data in React: 
  flag as CRITICAL, propose DOMPurify sanitization or restructuring 
  to avoid dangerouslySetInnerHTML entirely
- If URL parameters injected into DOM without encoding: flag as HIGH,
  propose encodeURIComponent() or React safe rendering
- If [FromBody]/[FromQuery]/[FromRoute] input used without validation:
  flag as HIGH, propose adding FluentValidation or Data Annotations

## A04 — Insecure Design
- If sensitive operation exposed via GET request: flag as HIGH, 
  propose moving to POST with CSRF protection
- If file upload validates type/size on client only: flag as CRITICAL
  for a law firm — propose server-side validation in the .NET 
  controller checking MIME type and file size limits
- If list endpoint returns unbounded results: flag as MEDIUM, propose 
  adding pagination with a maximum page size

## A05 — Security Misconfiguration
- If AllowAnyOrigin() found in Program.cs CORS config: flag as HIGH,
  propose restricting to specific allowed origins
- If detailed error messages or stack traces enabled in production 
  config: flag as HIGH, propose using generic error responses and 
  logging details server-side only
- If unnecessary HTTP methods enabled: flag as MEDIUM, propose 
  restricting to required methods only
- If Azure App Service environment variables contain secrets: flag 
  as CRITICAL, propose moving to Azure Key Vault references

## A06 — Vulnerable and Outdated Components

### npm (Frontend)
- If `npm audit` returns CRITICAL or HIGH vulnerabilities: flag as 
  CRITICAL or HIGH respectively, block commit, propose running 
  `npm audit fix` or manual package upgrade to a safe version
- If `npm audit` returns MODERATE vulnerabilities: flag as MEDIUM, 
  require developer acknowledgment before proceeding
- If `socket scan` flags a package for behavioral risks (network 
  access, filesystem operations, obfuscated code, shell execution): 
  flag as CRITICAL, block commit, require developer to manually 
  review the package on socket.dev before proceeding
- If `socket scan` flags a package for typosquatting or compromised 
  maintainer account: flag as CRITICAL, block commit, remove the 
  package and require developer to verify the correct package name
- If dependency confusion risk detected — internal package name 
  resolvable from public npm registry: flag as CRITICAL, block 
  commit, propose scoping the internal package with @org/ prefix
- If `file:` or `git:` protocol pin found: flag as HIGH, propose 
  replacing with a proper versioned registry reference
- If unusual post-install script found in new package: flag as 
  CRITICAL, block commit, require developer to read and explicitly 
  approve the script contents before proceeding

### NuGet (.NET Backend)
- If `dotnet list package --vulnerable` returns CRITICAL or HIGH: 
  flag as CRITICAL or HIGH respectively, block commit, propose 
  upgrading to a patched version
- If `dotnet list package --vulnerable` returns MODERATE: flag as 
  MEDIUM, require developer acknowledgment
- If new NuGet package fails legitimacy checks (typosquat pattern, 
  Cyrillic characters in name, suspiciously low downloads, recently 
  created publisher, unsigned package): flag as CRITICAL, block 
  commit, require manual verification on nuget.org before proceeding
- If NuGet.Config has been modified: flag as HIGH, require developer 
  to explain the change and get team lead approval before proceeding
- If local file path reference (HintPath) added without justification: 
  flag as MEDIUM, require developer to document why a registry 
  reference cannot be used instead
- If dependency confusion risk detected — internal Azure Artifacts 
  package name resolvable from nuget.org: flag as CRITICAL, block 
  commit, propose using a scoped feed with upstream blocking enabled

## A07 — Authentication Failures
- If MSAL.js auth is bypassed or protected route has no auth check:
  flag as CRITICAL, propose adding auth guard using MSAL.js 
  isAuthenticated check
- If JWT token validation is missing or misconfigured on .NET side:
  flag as CRITICAL, propose adding proper token validation middleware
- If token stored in localStorage or sessionStorage: flag as HIGH,
  propose migrating to httpOnly cookies
- If hardcoded test credentials or bypass flags found: flag as 
  CRITICAL, block commit, require immediate removal

## A08 — Software and Data Integrity
- If CI/CD pipeline file modified to skip security steps: flag as 
  CRITICAL, block commit, escalate to team lead for review — 
  this should never happen without explicit team approval
- If third party script added to frontend without justification: 
  flag as HIGH, require developer to document the source and purpose
- If npm scripts in package.json modified to run unexpected commands:
  flag as CRITICAL, block commit, require team review

## A09 — Security Logging Failures
- If authentication events are not logged: flag as MEDIUM, propose 
  adding ILogger calls for login, logout, and failed attempts
- If sensitive operations produce no audit log entries: flag as 
  MEDIUM, propose adding structured log entries for document access 
  and case updates
- If logs contain sensitive data (tokens, passwords, personal info):
  flag as HIGH, propose removing or masking sensitive fields
- If console.log outputs sensitive data in React: flag as HIGH,
  propose removing the console.log or replacing with non-sensitive 
  debug output

## A10 — Server Side Request Forgery
- If server-side HTTP call uses user-supplied URL without validation:
  flag as CRITICAL, propose adding URL allowlist validation before 
  making the request
- If internal Azure service URL is constructable from user input:
  flag as CRITICAL, propose hardcoding internal service URLs in 
  configuration rather than accepting them from user input