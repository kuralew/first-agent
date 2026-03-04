# /ship — Stage, commit, PR, and merge to main

Automates the full feature branch shipping workflow. Run this when you're ready to ship changes on a feature branch.

## Steps to follow

1. **Guard: ensure not on main**
   - Run `git branch --show-current`
   - If the current branch is `main`, stop and tell the user: "You're on main. Switch to a feature branch first."

2. **Show what will be committed**
   - Run `git status` and `git diff HEAD` so the user can see what's changing

3. **Stage all changes**
   - Run `git add -A`

4. **Generate and confirm commit message**
   - Analyze the diff to write a concise, imperative commit message (1-2 sentences max)
   - Show the message to the user and ask them to confirm or provide their own

5. **Commit**
   - Commit with the confirmed message, appending:
     `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

6. **Push**
   - Run `git push`

7. **Create PR**
   - Use `gh pr create` with a title and body derived from the commit message
   - Use `GH_TOKEN` from environment if `gh` auth isn't set up (remind user to set it if missing)

8. **Merge PR**
   - Run `gh pr merge --merge --admin`

9. **Clean up**
   - `git checkout main && git pull`
   - Delete the feature branch: `git push origin --delete <branch>` and `git branch -d <branch>`

10. **Done** — report the merge commit SHA and confirm main is up to date
