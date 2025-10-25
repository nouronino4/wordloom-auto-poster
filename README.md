# Wordloom Auto Poster

This repository automatically generates 1 SEO blog post and 1 Reddit post per run using Gemini 2.5 Pro, then publishes to Blogger and Reddit. The workflow is scheduled to run 3 times/day via GitHub Actions.

## Setup
1. Create a **public** GitHub repo and push these files.
2. In the repo settings → Secrets → Actions add the required secrets from `.env.example`.
3. Ensure your Blogger token is a valid OAuth2 Bearer token with permission to create posts on the target blog.
4. Create a Reddit app (script type) to get client id & secret, and ensure the account can post to the target subreddit.
5. Commit and push. The workflow runs automatically at 09:00, 15:00, 21:00 UTC (adjust cron in `.github/workflows/auto_post.yml` if needed).

## Notes
- GitHub Actions free minutes for public repositories are unlimited for public workflows, but respect API quotas for Gemini and Reddit.
- Test the script locally first by copying env values into a `.env` file and running `node index.js`.
