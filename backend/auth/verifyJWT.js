const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client for auth verification
// Uses environment variables that should be set in the backend environment
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const verifyJWT = async (req, res, next) => {
  // Allow skipping auth for specific endpoints if needed, or handle guest mode
  if (req.headers['x-guest-mode'] === 'true') {
      return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new Error('Invalid token');
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Error:', error.message);
    return res.status(403).json({ error: 'Unauthorized' });
  }
};

module.exports = verifyJWT;