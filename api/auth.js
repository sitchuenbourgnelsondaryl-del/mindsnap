// api/auth.js
// Handles: register, login, getUser, saveSession

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabase(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': method === 'POST' ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function hashPass(pass) {
  // Simple hash - in production use bcrypt
  let hash = 0;
  for (let i = 0; i < pass.length; i++) {
    hash = ((hash << 5) - hash) + pass.charCodeAt(i);
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36) + '_' + pass.length;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, email, password, name } = req.body;

  // ── REGISTER ──
  if (action === 'register') {
    if (!email || !password || !name) return res.status(400).json({ error: 'Champs manquants.' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court.' });

    // Check if exists
    const existing = await supabase('GET', `users?email=eq.${encodeURIComponent(email)}&select=id`);
    if (existing && existing.length > 0) return res.status(400).json({ error: 'Email déjà utilisé.' });

    const data = await supabase('POST', 'users', {
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password_hash: hashPass(password),
    });

    if (!data || data.error) return res.status(500).json({ error: 'Erreur création compte.' });

    const user = Array.isArray(data) ? data[0] : data;
    return res.status(200).json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, premium: user.premium }
    });
  }

  // ── LOGIN ──
  if (action === 'login') {
    if (!email || !password) return res.status(400).json({ error: 'Champs manquants.' });

    const data = await supabase('GET', `users?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=*`);
    if (!data || data.length === 0) return res.status(400).json({ error: 'Aucun compte avec cet email.' });

    const user = data[0];
    if (user.password_hash !== hashPass(password)) return res.status(400).json({ error: 'Mot de passe incorrect.' });

    return res.status(200).json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, premium: user.premium, plan: user.premium_plan }
    });
  }

  // ── GET USER ──
  if (action === 'getUser') {
    const data = await supabase('GET', `users?id=eq.${req.body.id}&select=*`);
    if (!data || data.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const user = data[0];
    return res.status(200).json({
      user: { id: user.id, email: user.email, name: user.name, premium: user.premium, plan: user.premium_plan, total_answered: user.total_answered, total_sessions: user.total_sessions }
    });
  }

  // ── SAVE GAME SESSION ──
  if (action === 'saveSession') {
    const { userId, session } = req.body;
    await supabase('POST', 'game_sessions', {
      user_id: userId,
      profile_key: session.pkey,
      profile_name: session.prof,
      profile_emoji: session.emoji,
      category: session.cat,
      total_questions: session.total,
      minority_count: session.minority,
      avg_pct: session.avgPct,
    });
    // Update user stats
    await supabase('PATCH', `users?id=eq.${userId}`, {
      total_answered: session.totalAnswered,
      total_sessions: session.totalSessions,
    });
    return res.status(200).json({ success: true });
  }

  // ── UPDATE NAME ──
  if (action === 'updateName') {
    const { userId, name } = req.body;
    await supabase('PATCH', `users?id=eq.${userId}`, { name });
    return res.status(200).json({ success: true });
  }

  // ── DELETE ACCOUNT ──
  if (action === 'deleteAccount') {
    const { userId } = req.body;
    await supabase('DELETE', `users?id=eq.${userId}`);
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Action inconnue.' });
}

