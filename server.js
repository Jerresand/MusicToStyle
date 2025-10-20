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

// Compute redirect URI dynamically to support multiple environments/domains
function getRedirectUri(req) {
  // If an explicit env override is set, prefer it
  if (process.env.REDIRECT_URI) return process.env.REDIRECT_URI;

  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) {
    // Fallback to default local redirect
    return REDIRECT_URI;
  }
  return `${proto}://${host}/callback`;
}

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

// Parse style recommendations from OpenAI response
function parseStyleRecommendations(analysis) {
  const recommendations = [];
  
  // Extract content between [STYLE_RECOMMENDATIONS] and [/STYLE_RECOMMENDATIONS]
  const regex = /\[STYLE_RECOMMENDATIONS\]([\s\S]*?)\[\/STYLE_RECOMMENDATIONS\]/;
  const match = analysis.match(regex);
  
  if (!match) {
    return recommendations;
  }
  
  const content = match[1].trim();
  const sections = content.split('CATEGORY:').filter(section => section.trim());
  
  sections.forEach(section => {
    const lines = section.trim().split('\n');
    const category = lines[0]?.trim();
    
    if (!category) return;
    
    let items = [];
    let style = '';
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('ITEMS:')) {
        items = line.replace('ITEMS:', '').split(',').map(item => item.trim()).filter(item => item);
      } else if (line.startsWith('STYLE:')) {
        style = line.replace('STYLE:', '').trim();
      }
    }
    
    if (items.length > 0) {
      recommendations.push({
        category,
        items,
        style,
        links: generateProductLinks(category, items)
      });
    }
  });
  
  return recommendations;
}

// Generate product links based on category and items
function generateProductLinks(category, items) {
  const links = [];
  
  // Define search terms and affiliate links for different categories
  const categoryMappings = {
    'clothing': {
      searchTerms: items.map(item => `${item} clothing`),
      baseUrl: 'https://www.amazon.com/s?k=',
      affiliateTag: '&tag=musictostyle-20'
    },
    'shoes': {
      searchTerms: items.map(item => `${item} shoes`),
      baseUrl: 'https://www.amazon.com/s?k=',
      affiliateTag: '&tag=musictostyle-20'
    },
    'accessories': {
      searchTerms: items.map(item => `${item} accessories`),
      baseUrl: 'https://www.amazon.com/s?k=',
      affiliateTag: '&tag=musictostyle-20'
    },
    'furniture': {
      searchTerms: items.map(item => `${item} furniture`),
      baseUrl: 'https://www.amazon.com/s?k=',
      affiliateTag: '&tag=musictostyle-20'
    },
    'home decor': {
      searchTerms: items.map(item => `${item} home decor`),
      baseUrl: 'https://www.amazon.com/s?k=',
      affiliateTag: '&tag=musictostyle-20'
    },
    'art': {
      searchTerms: items.map(item => `${item} wall art`),
      baseUrl: 'https://www.amazon.com/s?k=',
      affiliateTag: '&tag=musictostyle-20'
    }
  };
  
  // Default to general search if category not found
  const mapping = categoryMappings[category.toLowerCase()] || {
    searchTerms: items.map(item => `${item} ${category}`),
    baseUrl: 'https://www.amazon.com/s?k=',
    affiliateTag: '&tag=musictostyle-20'
  };
  
  items.forEach((item, index) => {
    const searchTerm = mapping.searchTerms[index] || `${item} ${category}`;
    const encodedTerm = encodeURIComponent(searchTerm);
    const link = `${mapping.baseUrl}${encodedTerm}${mapping.affiliateTag}`;
    
    links.push({
      item: item,
      url: link,
      searchTerm: searchTerm
    });
  });
  
  return links;
}

// Routes

// Home page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Initiate Spotify OAuth flow
app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  const scope = scopes.join(' ');

  const dynamicRedirectUri = getRedirectUri(req);
  const authParams = querystring.stringify({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: scope,
    redirect_uri: dynamicRedirectUri,
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
      const dynamicRedirectUri = getRedirectUri(req);
      const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', 
        querystring.stringify({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: dynamicRedirectUri
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
    
    // Get user's profile for name/gender detection
    const profileResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
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
    
    const prompt = `Listen up, you judgmental piece of shit. I need you to analyze this person's music taste with some actual nuance for once. Their name is "${profileResponse.data.display_name}" and here's what they've been bumping over ${timeRangeText}:

${trackData.map((track, index) => `${index + 1}. "${track.name}" by ${track.artists} (from album: ${track.album})`).join('\n')}

Here's the fucking deal - I want VARIANCE in your criticism. Don't just default to "everything is trash." Actually look at what they're listening to:

- If they have genuinely good taste (classic albums, respected artists, diverse genres): Call them out for being pretentious assholes who probably name-drop bands to sound cool at parties. Roast their personality, not the music.
- If they have basic/mainstream taste: Tear into how predictable and boring they are, but acknowledge that at least they're not trying too hard.
- If they have genuinely bad taste (terrible pop, dated shit, problematic artists): Go absolutely savage on the music itself.
- If they're trying too hard to be different: Destroy them for their performative edge and fake depth.

BE MORE DARING:
- Use more profanity, be more offensive
- Don't hold back on controversial takes
- Call out specific problematic shit if you see it
- Be sharper with your observations

BUT ALSO BE SMART:
- If someone's taste is actually good, acknowledge it while roasting their pretentiousness
- If someone's taste is genuinely diverse and interesting, call them out for being insufferable know-it-alls
- Don't just default to "everything sucks" - that's lazy as fuck

Use "you" form, curse like a sailor, and make it brutally honest but with actual thought behind it. No bullet points - just flowing roast paragraphs that actually make sense.

After your analysis, provide specific product recommendations in this EXACT format:
[STYLE_RECOMMENDATIONS]
CATEGORY: [category name]
ITEMS: [specific item 1], [specific item 2], [specific item 3]
STYLE: [brief style description]

CATEGORY: [next category]
ITEMS: [specific item 1], [specific item 2], [specific item 3]
STYLE: [brief style description]
[/STYLE_RECOMMENDATIONS]`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a brutally honest, sharp-tongued style critic who analyzes music taste with actual intelligence and variance. You're daring, profane, and don't hold back on controversial takes. You're not just mean for the sake of being mean - you actually assess the quality of their taste and roast accordingly. If someone has good taste, you call them pretentious assholes rather than shitting on the music itself. If they have bad taste, you destroy it. If they're basic, you roast their predictability. If they're trying too hard, you call out their performative bullshit. You use profanity liberally, make sharp observations, and deliver brutally honest critiques that actually make sense. You speak directly to the person in 'you' form and give them style recommendations based on your analysis."
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

    // Parse style recommendations from the analysis
    const styleRecommendations = parseStyleRecommendations(analysis);

    // Create links text to append to analysis
    let linksText = '';
    if (styleRecommendations && styleRecommendations.length > 0) {
      linksText = '\n\n🛍️ **PRODUCT LINKS:**\n';
      styleRecommendations.forEach(rec => {
        linksText += `\n**${rec.category}:**\n`;
        rec.links.forEach(link => {
          linksText += `• [${link.item}](${link.url})\n`;
        });
      });
    }

    // Combine analysis with links
    const finalAnalysis = analysis + linksText;

    res.json({
      success: true,
      analysis: finalAnalysis,
      styleRecommendations: styleRecommendations,
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
