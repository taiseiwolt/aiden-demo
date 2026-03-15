import { supabase } from '../_lib/supabase.js';
import { stripe } from '../_lib/stripe.js';

export const config = {
  api: { bodyParser: false }, // Raw body needed for Stripe signature verification
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature verification failed: ' + err.message });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const orderId = pi.metadata?.order_id;
        if (orderId) {
          await supabase
            .from('orders')
            .update({ payment_status: 'captured' })
            .eq('id', orderId);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const orderId = pi.metadata?.order_id;
        if (orderId) {
          await supabase
            .from('orders')
            .update({ payment_status: 'failed', status: 'cancelled' })
            .eq('id', orderId);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const pi = charge.payment_intent;
        if (pi) {
          // Find order by payment_intent_id
          const { data: order } = await supabase
            .from('orders')
            .select('id')
            .eq('payment_intent_id', pi)
            .single();

          if (order) {
            await supabase
              .from('orders')
              .update({ payment_status: 'refunded' })
              .eq('id', order.id);
          }
        }
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: 'Webhook processing failed: ' + e.message });
  }
}
