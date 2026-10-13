# ORBIT launch checklist

## Before publishing
- [ ] Confirm you are comfortable making the developer name in the app and license public.
- [ ] Keep a private backup of the original app.
- [ ] Review the app's feature claims and verify each feature.
- [ ] Do not upload planner exports, credentials, or private data.
- [ ] Review `tests/README.md`: the inherited browser tests need to be checked against the latest app.

## Create the repository
1. Create a new GitHub repository named `orbit` (or your chosen name).
2. Set it to **Public**.
3. Do not initialize it with a README, license, or `.gitignore`; this folder already contains those files.
4. Upload the *contents* of this folder to the repository root. `index.html` must be at the top level.

## Publish with GitHub Pages
1. Go to repository Settings → Pages.
2. Set the source to **GitHub Actions**.
3. Open Actions and wait for `Deploy ORBIT to GitHub Pages` to succeed.
4. Open the site URL shown in Settings → Pages, including in a private window and on a phone.

## After creating the repo
Update the app's CFG links for GitHub, repository, issues, and site to the real URLs. Search for `CFG={` in `index.html`. Do not guess the URLs.

## Smoke test
- [ ] Create/edit/complete/delete a test task.
- [ ] Generate a schedule and check fixed-time tasks/conflicts.
- [ ] Refresh and confirm data persistence.
- [ ] Test JSON/CSV export.
- [ ] Test JSON import only with disposable data.
- [ ] Check any advertised timer, goals, recurring tasks, and analytics.
- [ ] Check mobile navigation and obvious console errors.

The deployment workflow publishes static files; it does not run browser tests. Do not claim full test coverage unless tests have actually run.
