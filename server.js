const express = require('express');
const cors = require('cors');
const axios = require('axios');
const querystring = require('querystring');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Spotify API configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';

// OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Generate random string for state parameter
const generateRandomString = (length) => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

// Spotify OAuth scopes
const scopes = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played'
];

// Routes

// Home page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Initiate Spotify OAuth flow
app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  const scope = scopes.join(' ');

  const authParams = querystring.stringify({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: scope,
    redirect_uri: REDIRECT_URI,
    state: state
  });

  res.redirect(`https://accounts.spotify.com/authorize?${authParams}`);
});

// Handle OAuth callback
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (state === null) {
    res.redirect('/?error=state_mismatch');
  } else {
    try {
      // Exchange code for access token
      const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', 
        querystring.stringify({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI
        }),
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      // Redirect to dashboard with token in URL fragment (for client-side handling)
      res.redirect(`/dashboard#access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`);
    } catch (error) {
      console.error('Error exchanging code for token:', error.response?.data || error.message);
      res.redirect('/?error=invalid_token');
    }
  }
});

// Get user's top tracks
app.get('/api/top-tracks', async (req, res) => {
  const accessToken = req.headers.authorization?.replace('Bearer ', '');
  
  if (!accessToken) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const timeRange = req.query.time_range || 'medium_term'; // short_term, medium_term, long_term
    const limit = req.query.limit || 20;

    const response = await axios.get(`https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching top tracks:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch top tracks',
      details: error.response?.data || error.message
    });
  }
});

// Get user profile
app.get('/api/profile', async (req, res) => {
  const accessToken = req.headers.authorization?.replace('Bearer ', '');
  
  if (!accessToken) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const response = await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching profile:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch profile',
      details: error.response?.data || error.message
    });
  }
});

// Analyze musical taste and generate aesthetic recommendations
app.post('/api/analyze-taste', async (req, res) => {
  const accessToken = req.headers.authorization?.replace('Bearer ', '');
  
  if (!accessToken) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Get time range from request body, default to medium_term
    const timeRange = req.body.time_range || 'medium_term';
    
    // Get user's top tracks for the specified time range
    const tracksResponse = await axios.get(`https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=50`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const tracks = tracksResponse.data.items;
    
    if (tracks.length === 0) {
      return res.status(400).json({ error: 'No tracks found for analysis' });
    }

    // Prepare track data for analysis
    const trackData = tracks.map(track => ({
      name: track.name,
      artists: track.artists.map(artist => artist.name).join(', '),
      album: track.album.name,
      genres: track.artists[0]?.genres || [],
      popularity: track.popularity,
      explicit: track.explicit
    }));

    // Create prompt for OpenAI
    const timeRangeText = timeRange === 'short_term' ? 'the last 4 weeks' : 
                         timeRange === 'medium_term' ? 'the last 6 months' : 
                         'all time';
    
    const prompt = `Based on the following list of songs that a person has been listening to over ${timeRangeText}, analyze their musical taste and provide aesthetic recommendations for their personal style, fashion, and lifestyle preferences.

Songs they've been listening to:
${trackData.map((track, index) => `${index + 1}. "${track.name}" by ${track.artists} (from album: ${track.album})`).join('\n')}

Please provide:
1. A brief analysis of their musical taste and personality traits it suggests
2. Specific aesthetic recommendations including:
   - Fashion style suggestions
   - Color palette preferences
   - Lifestyle and decor recommendations
   - Any cultural or subculture influences
   
    Write all the recommendations as if the person you are reviewing is beneath you, as if you are a pretentious culture critic that is better than everyone else. No structure to the writing apart from paragraphs. Grammar should be correct, but creative, sharp, maybe even curse a bit.`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a style consultant who specializes in translating musical taste into aesthetic recommendations. You provide insightful, specific, and actionable advice about fashion, lifestyle, and visual preferences based on someone's music listening habits."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const analysis = completion.choices[0].message.content;

    res.json({
      success: true,
      analysis: analysis,
      tracksAnalyzed: tracks.length,
      timeRange: timeRangeText
    });

  } catch (error) {
    console.error('Error analyzing musical taste:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to analyze musical taste',
      details: error.response?.data || error.message
    });
  }
});

// Dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Export the app for Vercel
module.exports = app;

// Only start server if not in Vercel environment
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Make sure to set up your Spotify app credentials in the .env file');
  });
}
