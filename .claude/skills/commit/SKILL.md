---
name: commit
description: Safe commit that enforces code-review and security-review before every commit. Use this instead of raw git commit.
version: "0.1"
---

# /commit — Review-gated commit

Every commit must pass both /code-review and /security-review before it is allowed. This skill enforces that sequence.

## Steps

### 1. Check for changes
- Run `git status` to verify there are staged or unstaged changes to commit
- If nothing to commit, stop and tell the developer

### 2. Stage changes
- If $ARGUMENTS contains specific files, stage only those files
- Otherwise, show `git status` and ask the developer what to stage
- Do NOT stage `.env`, credentials, or generated reports (PDFs)

### 3. Run /code-review
- Execute the /code-review skill against the staged changes
- Wait for the full report

### 4. Evaluate code-review result
- If any findings are reported: stop and tell the developer to run `/remediation` to fix the issues, then re-run `/commit`
- If no findings (clean pass): proceed to step 5

### 5. Run /security-review
- Execute the /security-review skill against the staged changes
- Wait for the full report

### 6. Evaluate security-review result
- If any CRITICAL or HIGH findings: stop and tell the developer to run `/remediation` to fix the issues, then re-run `/commit`
- If MEDIUM findings only: report them and ask the developer whether to proceed or fix first
- If no findings (clean pass): proceed to step 7

### 7. Generate commit message
- Analyze the diff to write a concise, imperative commit message (1-2 sentences max)
- Show the message to the developer and ask them to confirm or provide their own

### 8. Unlock the commit hook
- Run: `touch /tmp/commit-allowed`
- This signals the PreToolUse hook that reviews have passed and the next `git commit` should be allowed through

### 9. Commit
- Commit with the confirmed message, appending:
  `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Report success with the commit SHA

## Important
- This skill is the ONLY way to commit code in this project
- Raw `git commit` commands are blocked by a hook — they will be rejected
- If reviews fail, the developer must run /remediation and then re-run /commit
