# Huang Yue — Claude Code Guidelines

## Git workflow

All changes must go through pull requests. Never commit directly to `main`.

1. Before starting any work, create a feature branch:
   ```
   git checkout main && git pull origin main && git checkout -b feat/<short-description>
   ```
2. Commit changes to the feature branch.
3. Push the branch and open a PR targeting `main`:
   ```
   git push -u origin feat/<short-description>
   gh pr create --base main
   ```
4. Report the PR URL to the user wrapped in a `<pr-created>` tag.

## Project context

- Single-page app for learning Chinese via spaced repetition (SRS).
- Hosted on Firebase (Firestore + Auth) + Vercel.
- No build step — plain HTML/CSS/JS (ES modules via Firebase CDN).
- `app.js` is the entire frontend logic. `main.css` is all styles. `index.html` is the shell.
- `cvdict.json` is a local Chinese–Vietnamese dictionary used for lookups.
