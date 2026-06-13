export default async function handler(req, res) {
  const plan = req.query.plan || 'yearly';
  
  const prices = {
    yearly:  process.env.STRIPE_PRICE_YEARLY,
    monthly: process.env.STRIPE_PRICE_MONTHLY,
  };

  const priceId = prices[plan];
  const baseUrl = `https://${req.headers.host}`;

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'subscription',
        'payment_method_types[0]': 'card',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        success_url: `${baseUrl}/?premium=success`,
        cancel_url:  `${baseUrl}/?premium=cancel`,
        allow_promotion_codes: 'true',
      }),
    });

    const session = await response.json();

    if (session.error) {
      return res.status(400).json({ error: session.error.message });
    }

    res.redirect(303, session.url);
  } catch (err) {
    res.status(500).json({ error: 'Stripe error: ' + err.message });
  }
}
