# Vercel Deployment Guide for MusicToStyle

## 🚀 Deploying to Vercel with Environment Variables

### Step 1: Install Vercel CLI (if not already installed)
```bash
npm install -g vercel
```

### Step 2: Login to Vercel
```bash
vercel login
```

### Step 3: Set up Environment Variables in Vercel

#### Option A: Using Vercel CLI
```bash
# Set your Spotify credentials
vercel env add SPOTIFY_CLIENT_ID
vercel env add SPOTIFY_CLIENT_SECRET
vercel env add REDIRECT_URI

# When prompted, enter your values:
# SPOTIFY_CLIENT_ID: your_spotify_client_id_from_dashboard
# SPOTIFY_CLIENT_SECRET: your_spotify_client_secret_from_dashboard
# REDIRECT_URI: https://your-app-name.vercel.app/callback
```

#### Option B: Using Vercel Dashboard
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to Settings → Environment Variables
4. Add the following variables:

| Name | Value | Environment |
|------|-------|-------------|
| `SPOTIFY_CLIENT_ID` | Your Spotify Client ID | Production, Preview, Development |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify Client Secret | Production, Preview, Development |
| `REDIRECT_URI` | `https://your-app-name.vercel.app/callback` | Production, Preview, Development |

### Step 4: Update Spotify App Settings

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Select your app
3. Click "Edit Settings"
4. Add your Vercel URL to "Redirect URIs":
   - `https://your-app-name.vercel.app/callback`
5. Save changes

### Step 5: Deploy to Vercel

#### First Deployment
```bash
vercel
```

#### Subsequent Deployments
```bash
vercel --prod
```

### Step 6: Verify Deployment

1. Visit your Vercel URL: `https://your-app-name.vercel.app`
2. Click "Connect with Spotify"
3. Complete the OAuth flow
4. Verify that your top tracks are displayed

## 🔧 Environment Variables Reference

### Required Variables:
- `SPOTIFY_CLIENT_ID`: Your Spotify app's client ID
- `SPOTIFY_CLIENT_SECRET`: Your Spotify app's client secret
- `REDIRECT_URI`: The callback URL (your Vercel domain + `/callback`)

### Optional Variables:
- `NODE_ENV`: Set to `production` for production builds
- `PORT`: Port number (Vercel handles this automatically)

## 🛠️ Troubleshooting

### Common Issues:

1. **"Invalid redirect URI" error**
   - Ensure your Spotify app's redirect URI matches your Vercel URL exactly
   - Check that the URI includes `https://` and ends with `/callback`

2. **"Invalid client" error**
   - Verify your `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are correct
   - Make sure environment variables are set for the correct environment

3. **CORS errors**
   - The app includes CORS middleware, but if you encounter issues, check your domain settings

4. **Token not persisting**
   - The app uses localStorage for token persistence
   - Clear browser data if you encounter authentication issues

### Debugging:
- Check Vercel function logs: `vercel logs`
- Use browser developer tools to inspect network requests
- Verify environment variables are loaded: Add `console.log(process.env.SPOTIFY_CLIENT_ID)` temporarily

## 📝 Notes

- The app is configured to work with Vercel's serverless functions
- Static files are served from the `public` directory
- The `vercel.json` file configures the deployment settings
- Environment variables are automatically injected by Vercel

## 🔄 Updating Environment Variables

To update environment variables after deployment:
```bash
vercel env rm SPOTIFY_CLIENT_ID
vercel env add SPOTIFY_CLIENT_ID
# Enter new value when prompted
vercel --prod  # Redeploy with new variables
```
