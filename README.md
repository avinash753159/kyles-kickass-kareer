# Kyle's Job Board

Dark-mode job board with AI fit scoring, resume tailoring, Hunter.io email finder, and LinkedIn mutual connection search.

## Deploy to Railway

1. Push this folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub
3. Select the repo
4. Add environment variable: `HUNTER_API_KEY=7b5adce8f66f24b8af6f4439f1fde92de4b5b0dc`
5. Railway auto-detects Node.js and deploys

## Features
- Fit % ring that updates live as Kyle checks boxes
- Resume auto-tailors based on checked boxes
- Hunter.io "find direct email" per hiring manager
- LinkedIn mutual connection search link per company
- Pipeline tracker
- Nudge alerts for stale outreach
- Notes per company
