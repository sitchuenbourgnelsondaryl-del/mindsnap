import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  yearly:  process.env.STRIPE_PRICE_YEARLY,   // ex: price_xxx
  monthly: process.env.STRIPE_PRICE_MONTHLY,  // ex: price_xxx
};

export default async function handler(req, res) {
  const plan = req.query.plan || 'yearly';
  const priceId = PRICES[plan];

  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?premium=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/?premium=cancel`,
      allow_promotion_codes: true,
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: 'Stripe session creation failed' });
  }
}
