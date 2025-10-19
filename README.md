# MusicToStyle

An application that uses the Spotify API to access a user's most listened songs and help them discover their music style.

## Features

- Spotify OAuth authentication
- Access to user's top tracks (short-term, medium-term, long-term)
- Clean, modern UI to display music preferences
- Style analysis based on listening habits

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up Spotify App:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new app
   - Set redirect URI to `http://localhost:3000/callback`
   - Copy Client ID and Client Secret

3. Create `.env` file:
   ```
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   REDIRECT_URI=http://localhost:3000/callback
   ```

4. Run the application:
   ```bash
   npm run dev
   ```

## API Endpoints

- `GET /login` - Initiate Spotify OAuth flow
- `GET /callback` - Handle OAuth callback
- `GET /top-tracks` - Get user's top tracks
- `GET /profile` - Get user profile information

## Technologies Used

- Node.js & Express
- Spotify Web API
- OAuth 2.0
- HTML/CSS/JavaScript (frontend)
# MusicToStyle
