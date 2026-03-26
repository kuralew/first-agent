import { useState, useEffect } from "react";
import axios from "axios";

// [FIX #1 & #2] Hardcoded secrets removed entirely.
// API keys and DB connections belong server-side only (env vars / Key Vault).

const ALLOWED_REDIRECT_ORIGINS = [
  window.location.origin,
  "https://app.lawfirm.com",
];

function isAllowedRedirect(url: string | null): url is string {
  if (!url) return false;
  // Allow relative paths
  if (url.startsWith("/")) return true;
  // Allow only approved origins
  try {
    const parsed = new URL(url);
    return ALLOWED_REDIRECT_ORIGINS.includes(parsed.origin);
  } catch {
    return false;
  }
}

export default function AuthCallback() {
  const [description, setDescription] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectUrl = params.get("redirect");

    // [FIX #5] Token retrieved from httpOnly cookie by the server automatically.
    // No client-side token access needed.

    // [FIX #6] userId comes from the authenticated session on the server,
    // not from URL params. The server validates ownership.
    axios
      .get("/api/cases/me")
      .then((res) => {
        // [FIX #3] Use React state to render safely — no innerHTML/XSS risk
        setDescription(res.data.description ?? "");

        // [FIX #8] Removed console.log of auth token and user data.

        // [FIX #7] Validate redirect URL against allowlist before navigating
        if (isAllowedRedirect(redirectUrl)) {
          window.location.href = redirectUrl;
        }
      });

    // [FIX #4] Internal audit call uses a hardcoded server-side URL.
    // The client triggers the audit; the server knows the internal endpoint.
    axios.post("/api/audit/auth-callback");
  }, []);

  return <div>{description}</div>;
}
