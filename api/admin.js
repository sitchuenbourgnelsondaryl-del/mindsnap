const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL = 'sitchuenbourgnelsondaryl@gmail.com';

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

async function verifyAdmin(userId) {
  if (!userId) return false;
  const data = await sb('GET', `users?id=eq.${userId}&select=email`);
  if (!Array.isArray(data) || data.length === 0) return false;
  return data[0].email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { action, requesterId } = body || {};

  // Every admin action requires proof the requester is the admin
  const isAdmin = await verifyAdmin(requesterId);
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé. Réservé à l\'administrateur.' });

  // ── LIST ALL USERS ──
  if (action === 'listUsers') {
    const data = await sb('GET', `users?select=id,email,name,premium,premium_plan,total_answered,total_sessions,created_at,is_admin&order=created_at.desc`);
    return res.status(200).json({ users: Array.isArray(data) ? data : [] });
  }

  // ── TOGGLE PREMIUM ON A USER ──
  if (action === 'togglePremium') {
    const { targetUserId, premium, plan } = body;
    if (!targetUserId) return res.status(400).json({ error: 'ID manquant.' });
    await sb('PATCH', `users?id=eq.${targetUserId}`, {
      premium: !!premium,
      premium_plan: premium ? (plan || 'monthly') : null,
    });
    return res.status(200).json({ success: true });
  }

  // ── DELETE A USER (admin action) ──
  if (action === 'deleteUser') {
    const { targetUserId } = body;
    if (!targetUserId) return res.status(400).json({ error: 'ID manquant.' });
    await sb('DELETE', `users?id=eq.${targetUserId}`);
    return res.status(200).json({ success: true });
  }

  // ── GLOBAL STATS ──
  if (action === 'stats') {
    const users = await sb('GET', `users?select=id,premium,premium_plan,created_at`);
    const list = Array.isArray(users) ? users : [];
    const totalUsers = list.length;
    const premiumUsers = list.filter(u => u.premium).length;
    const monthlyCount = list.filter(u => u.premium && u.premium_plan === 'monthly').length;
    const yearlyCount = list.filter(u => u.premium && u.premium_plan === 'yearly').length;
    const estimatedMonthlyRevenue = (monthlyCount * 4.99) + (yearlyCount * 39 / 12);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newThisWeek = list.filter(u => new Date(u.created_at) > sevenDaysAgo).length;

    const comments = await sb('GET', `comments?select=id`);
    const totalComments = Array.isArray(comments) ? comments.length : 0;

    const sessions = await sb('GET', `game_sessions?select=id`);
    const totalSessions = Array.isArray(sessions) ? sessions.length : 0;

    return res.status(200).json({
      totalUsers,
      premiumUsers,
      freeUsers: totalUsers - premiumUsers,
      monthlyCount,
      yearlyCount,
      estimatedMonthlyRevenue: Math.round(estimatedMonthlyRevenue * 100) / 100,
      newThisWeek,
      totalComments,
      totalSessions,
    });
  }

  // ── LIST ALL COMMENTS (across all questions, for moderation) ──
  if (action === 'listComments') {
    const data = await sb('GET', `comments?select=id,author_name,question_id,text,mood,created_at&order=created_at.desc&limit=100`);
    return res.status(200).json({ comments: Array.isArray(data) ? data : [] });
  }

  // ── DELETE A COMMENT (admin action) ──
  if (action === 'deleteComment') {
    const { commentId } = body;
    if (!commentId) return res.status(400).json({ error: 'ID manquant.' });
    await sb('DELETE', `comments?id=eq.${commentId}`);
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Action inconnue: ' + action });
}
