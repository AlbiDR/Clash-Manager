# Remediation plan for leaked secrets

If automated secret scanners report findings, follow these steps to triage them (TruffleHog was previously used but the scan has been removed):

## Immediate actions (first 5–15 minutes)

1. **Rotate/revoke the secret immediately.**
   - For GitHub PATs: Settings → Developer settings → Personal access tokens → Revoke.
   - For service provider keys: revoke/rotate in the provider dashboard.
2. **Notify the team** (create an issue and/or ping in the team chat).
3. **Do not share the secret in messages or PRs.**

## Determine scope

- Download any scanner artifacts (e.g., `trufflehog-git.json`, `trufflehog.json`, or equivalent) from the CI run and inspect findings if available.
- Identify filenames, commits, commit SHAs, and authors associated with each finding.

## If secrets appear in commit history (recommended approach)

1. Mirror the repository locally (recommended: on a machine with secure credentials):

   ```bash
   git clone --mirror https://github.com/<org>/<repo>.git repo.git
   cd repo.git
   ```

2. Use `git-filter-repo` to remove/replace secrets:
   - Create `replacements.txt` with lines like:

     ```text
     literal:AKIAY... -> [REDACTED]
     ```

   - Run:

     ```bash
     git filter-repo --replace-text replacements.txt
     ```

3. Validate the result locally.
4. Force-push the rewritten history to origin and coordinate with contributors:

   ```bash
   git push --force --all
   git push --force --tags
   ```

5. Announce the change and require contributors to re-clone.

### Alternative: BFG Repo Cleaner (simpler but less flexible)

```bash
bfg --delete-files id_rsa
bfg --replace-text replacements.txt
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

## If secret only exists in working files or configuration (not committed)

- Remove the secret from the file, replace remote URL if needed, and commit the change.
- No history rewrite needed, but still rotate the secret.

## Token rotation checklist

- Revoke the old token immediately.
- Issue a new token with least privilege and expiry.
- Update services, CI secrets, and local dev envs.

## Preventative measures

- Add pre-commit hooks to block secrets (e.g., `pre-commit` + `detect-secrets` or `git-secrets`).
- Keep secret scanners (TruffleHog, Gitleaks, or alternatives) in CI if desired, and upload artifacts for triage.
- Educate contributors about never committing secrets and using environment variables.

## Example PR/Issue template

```
Summary: Rewrote git history to remove leaked secret(s) and rotated compromised credential(s).

What I did:
- Rotated/revoked compromised credential(s).
- Rewrote repo history to remove secret(s). SHA of rewrite: ...
- Steps for contributors: re-clone the repository with `git clone`.

If you need help restoring local branches, ping @team.
```

---

_If you want, I can draft the PR/Issue text and the exact `replacements.txt` if you provide or confirm the leaked values (do not paste secrets in messages)._
