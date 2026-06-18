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
  if (!RESEND_KEY) return;
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
  } catch(e) {}
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let event;
  try {
    event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch(e) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata && session.metadata.userId;
    const plan = session.metadata && session.metadata.plan;

    if (userId) {
      await sb('PATCH', `users?id=eq.${userId}`, {
        premium: true,
        premium_plan: plan || 'monthly',
        stripe_customer_id: session.customer || null,
        stripe_subscription_id: session.subscription || null,
      });

      const userData = await sb('GET', `users?id=eq.${userId}&select=email,name`);
      if (Array.isArray(userData) && userData.length > 0) {
        sendEmail(userData[0].email, '👑 Premium activé sur MindSnap', premiumEmailHtml(userData[0].name, plan));
      }
    }
  }

  res.status(200).json({ received: true });
}
