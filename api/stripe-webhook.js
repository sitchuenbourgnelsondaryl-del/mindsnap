export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Simple webhook - log the event
  // For full signature verification you need the raw body
  try {
    const event = req.body;
    
    if (event.type === 'checkout.session.completed') {
      console.log('New premium subscriber:', event.data.object.customer);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
