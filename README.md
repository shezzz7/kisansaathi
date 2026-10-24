# KisanSaathi on Vercel
- `public/index.html` is the app. `api/analyze.js` is the serverless AI function.
- Set `ANTHROPIC_API_KEY` in Vercel > Project Settings > Environment Variables, then redeploy.
- Without a key the app still works and shows labelled demo examples.
- Photos are shrunk in the browser before upload (Vercel limits request size to about 4.5 MB). Max 4 photos.
