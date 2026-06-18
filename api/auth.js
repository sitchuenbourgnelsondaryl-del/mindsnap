const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;

async function sb(method, path, body) {
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
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { return null; }
}

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) return; // skip silently if not configured
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: 'MindSnap <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    });
  } catch(e) { /* don't break the flow if email fails */ }
}

function welcomeEmailHtml(name) {
  return `
  <div style="font-family:sans-serif;background:#060608;color:#eeeaf8;padding:40px;border-radius:16px;max-width:480px;margin:0 auto">
    <h1 style="font-size:24px;background:linear-gradient(135deg,#c084fc,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Bienvenue sur MindSnap, ${name} !</h1>
    <p style="color:#9994ad;line-height:1.6">Ton compte est créé. Tu peux maintenant jouer aux dilemmes, recevoir ton analyse psychologique IA, et débloquer le Premium pour aller plus loin.</p>
    <a href="https://mindsnap-delta.vercel.app" style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;margin-top:16px">Commencer à jouer</a>
  </div>`;
}

function premiumEmailHtml(name, plan) {
  const planLabel = plan === 'yearly' ? 'annuel ($39/an)' : 'mensuel ($4.99/mois)';
  return `
  <div style="font-family:sans-serif;background:#060608;color:#eeeaf8;padding:40px;border-radius:16px;max-width:480px;margin:0 auto">
    <h1 style="font-size:24px;color:#f59e0b">👑 Premium activé !</h1>
    <p style="color:#9994ad;line-height:1.6">Merci ${name} ! Ton abonnement ${planLabel} est confirmé. Tu as maintenant accès à l'analyse profonde, au radar 8 dimensions, à la compatibilité relationnelle et au rapport PDF.</p>
    <a href="https://mindsnap-delta.vercel.app/dashboard.html" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#f97316);color:#0a0a0a;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;margin-top:16px">Voir mon profil</a>
  </div>`;
}

function hashPass(pass) {
  let h = 5381;
  for (let i = 0; i < pass.length; i++) {
    h = ((h << 5) + h) + pass.charCodeAt(i);
    h = h & h;
  }
  return 'ms_' + Math.abs(h).toString(16) + '_' + pass.length;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { action, email, password, name, id, userId } = body || {};

  // ── REGISTER ──
  if (action === 'register') {
    if (!email || !password || !name) return res.status(400).json({ error: 'Champs manquants.' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court.' });

    const existing = await sb('GET', `users?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=id`);
    if (Array.isArray(existing) && existing.length > 0) return res.status(400).json({ error: 'Email déjà utilisé.' });

    const data = await sb('POST', 'users', {
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password_hash: hashPass(password),
    });

    if (!data) return res.status(500).json({ error: 'Erreur création compte.' });
    const user = Array.isArray(data) ? data[0] : data;
    if (!user || !user.id) return res.status(500).json({ error: 'Erreur création compte.' });

    sendEmail(user.email, 'Bienvenue sur MindSnap 🎯', welcomeEmailHtml(user.name));

    return res.status(200).json({ success: true, user: { id: user.id, email: user.email, name: user.name, premium: user.premium || false } });
  }

  // ── LOGIN ──
  if (action === 'login') {
    if (!email || !password) return res.status(400).json({ error: 'Champs manquants.' });

    const data = await sb('GET', `users?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=*`);

    if (!Array.isArray(data) || data.length === 0) return res.status(400).json({ error: 'Aucun compte avec cet email.' });

    const user = data[0];
    if (!user) return res.status(400).json({ error: 'Aucun compte trouvé.' });

    if (user.password_hash !== hashPass(password)) return res.status(400).json({ error: 'Mot de passe incorrect.' });

    return res.status(200).json({ success: true, user: { id: user.id, email: user.email, name: user.name, premium: user.premium || false, plan: user.premium_plan || null } });
  }

  // ── GET USER ──
  if (action === 'getUser') {
    if (!id) return res.status(400).json({ error: 'ID manquant.' });
    const data = await sb('GET', `users?id=eq.${id}&select=*`);
    if (!Array.isArray(data) || data.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const user = data[0];
    return res.status(200).json({ user: { id: user.id, email: user.email, name: user.name, premium: user.premium || false, plan: user.premium_plan, total_answered: user.total_answered || 0, total_sessions: user.total_sessions || 0 } });
  }

  // ── UPDATE NAME ──
  if (action === 'updateName') {
    if (!userId || !name) return res.status(400).json({ error: 'Données manquantes.' });
    await sb('PATCH', `users?id=eq.${userId}`, { name });
    return res.status(200).json({ success: true });
  }

  // ── DELETE ACCOUNT ──
  if (action === 'deleteAccount') {
    if (!userId) return res.status(400).json({ error: 'ID manquant.' });
    await sb('DELETE', `users?id=eq.${userId}`);
    return res.status(200).json({ success: true });
  }

  // ── ACTIVATE PREMIUM ──
  if (action === 'activatePremium') {
    if (!userId) return res.status(400).json({ error: 'ID manquant.' });
    const plan = body.plan || 'monthly';
    await sb('PATCH', `users?id=eq.${userId}`, { premium: true, premium_plan: plan });

    const userData = await sb('GET', `users?id=eq.${userId}&select=email,name`);
    if (Array.isArray(userData) && userData.length > 0) {
      sendEmail(userData[0].email, '👑 Premium activé sur MindSnap', premiumEmailHtml(userData[0].name, plan));
    }

    return res.status(200).json({ success: true });
  }

  // ── SAVE SESSION ──
  if (action === 'saveSession') {
    if (!userId) return res.status(400).json({ error: 'ID manquant.' });
    const session = body.session || {};
    await sb('POST', 'game_sessions', {
      user_id: userId,
      profile_key: session.pkey,
      profile_name: session.prof,
      profile_emoji: session.emoji,
      category: session.cat,
      total_questions: session.total,
      minority_count: session.minority,
      avg_pct: session.avgPct,
    });
    await sb('PATCH', `users?id=eq.${userId}`, {
      total_answered: session.totalAnswered || 0,
      total_sessions: session.totalSessions || 0,
    });
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Action inconnue: ' + action });
}
