import { supabase } from '../_lib/supabase.js';
import { stripe } from '../_lib/stripe.js';
import { handleCors, ok, error } from '../_lib/response.js';
import { authenticateRequest, requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const pathSegments = req.query.path || [];

  // /api/orders/__root (rewritten from /api/orders)
  if (pathSegments[0] === '__root' || pathSegments.length === 0) {
    return handleOrdersRoot(req, res);
  }

  // /api/orders/[id]/cancel
  if (pathSegments[1] === 'cancel') {
    return handleCancel(req, res, pathSegments[0]);
  }

  // /api/orders/[id]/status
  if (pathSegments[1] === 'status') {
    return handleStatus(req, res, pathSegments[0]);
  }

  // /api/orders/[id]
  if (pathSegments[0]) {
    return handleOrderDetail(req, res, pathSegments[0]);
  }

  return error(res, 'Not found', 404);
}

// --- Orders Root: Create / List ---
async function handleOrdersRoot(req, res) {
  if (req.method === 'POST') {
    return handleCreate(req, res);
  } else if (req.method === 'GET') {
    return handleList(req, res);
  }
  return error(res, 'Method not allowed', 405);
}

async function handleCreate(req, res) {
  const auth = await authenticateRequest(req);
  const body = req.body || {};

  const {
    store_id, order_type,
    items,
    member_id,
    guest_name, guest_email, guest_phone,
    guest_address_prefecture, guest_address_city, guest_address_street, guest_address_building,
    delivery_address,
  } = body;

  if (!store_id || !order_type || !items || items.length === 0) {
    return error(res, 'store_id, order_type, items は必須です');
  }
  if (!['dinein', 'takeout', 'delivery'].includes(order_type)) {
    return error(res, 'order_type は dinein/takeout/delivery のいずれかです');
  }

  if (!auth && !member_id) {
    if (!guest_name || !guest_email) {
      return error(res, 'ゲスト注文には名前とメールアドレスが必要です');
    }
    if ((order_type === 'takeout' || order_type === 'delivery') && !guest_phone) {
      return error(res, 'テイクアウト/デリバリーには電話番号が必要です');
    }
    if (order_type === 'delivery' && !delivery_address && !guest_address_prefecture) {
      return error(res, 'デリバリーには配達先住所が必要です');
    }
  }

  try {
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      let unitPrice = 0;

      if (item.size_id) {
        const { data: size } = await supabase
          .from('product_sizes')
          .select('price')
          .eq('id', item.size_id)
          .single();
        unitPrice = size?.price || 0;
      } else {
        const { data: sizes } = await supabase
          .from('product_sizes')
          .select('price, name')
          .eq('product_id', item.product_id)
          .order('sort_order')
          .limit(1);
        unitPrice = sizes?.[0]?.price || 0;

        if (unitPrice === 0) {
          const { data: product } = await supabase
            .from('products')
            .select('price')
            .eq('id', item.product_id)
            .single();
          unitPrice = product?.price || 0;
        }
      }

      let optionTotal = 0;
      if (item.option_item_ids && item.option_item_ids.length > 0) {
        const { data: optionItems } = await supabase
          .from('option_items')
          .select('price_adjustment')
          .in('id', item.option_item_ids);
        optionTotal = (optionItems || []).reduce((sum, oi) => sum + (oi.price_adjustment || 0), 0);
      }

      const itemTotal = (unitPrice + optionTotal) * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        product_id: item.product_id,
        size_id: item.size_id || null,
        quantity: item.quantity,
        unit_price: unitPrice + optionTotal,
        subtotal: itemTotal,
        option_item_ids: item.option_item_ids || [],
      });
    }

    if (totalAmount < 1) return error(res, '注文合計が¥0です');

    let memberId = member_id || null;
    let stripeCustomerId = null;

    if (auth) {
      const { data: member } = await supabase
        .from('members')
        .select('id, stripe_customer_id')
        .eq('auth_user_id', auth.user.id)
        .single();

      if (member) {
        memberId = member.id;
        stripeCustomerId = member.stripe_customer_id;
      }
    }

    const paymentIntentParams = {
      amount: totalAmount,
      currency: 'jpy',
      capture_method: 'manual',
      metadata: { store_id, order_type },
    };

    if (stripeCustomerId) {
      paymentIntentParams.customer = stripeCustomerId;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    const deliveryAddr = delivery_address ||
      (guest_address_prefecture ? (guest_address_prefecture + guest_address_city + guest_address_street + (guest_address_building ? ' ' + guest_address_building : '')) : null);

    const orderData = {
      store_id,
      order_type,
      status: 'order_placed',
      total_amount: totalAmount,
      payment_intent_id: paymentIntent.id,
      member_id: memberId,
      customer_name: auth ? undefined : guest_name,
      customer_email: auth ? undefined : guest_email,
      customer_phone: auth ? undefined : guest_phone,
      delivery_address: deliveryAddr,
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderData)
      .select('id, tracking_token, status, total_amount, created_at')
      .single();

    if (orderError) {
      await stripe.paymentIntents.cancel(paymentIntent.id);
      return error(res, '注文の作成に失敗しました: ' + orderError.message, 500);
    }

    const itemInserts = orderItems.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      size_id: item.size_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    }));

    await supabase.from('order_items').insert(itemInserts);

    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: { ...paymentIntentParams.metadata, order_id: order.id },
    });

    return ok(res, {
      order_id: order.id,
      tracking_token: order.tracking_token,
      status: order.status,
      total_amount: order.total_amount,
      client_secret: paymentIntent.client_secret,
    }, 201);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

async function handleList(req, res) {
  const auth = await authenticateRequest(req);
  const { store_id, status, limit = 50, offset = 0 } = req.query;

  try {
    let query = supabase
      .from('orders')
      .select('id, store_id, order_type, status, total_amount, tracking_token, created_at, customer_name, member_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (store_id) query = query.eq('store_id', store_id);
    if (status) query = query.eq('status', status);

    if (auth && !store_id) {
      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('auth_user_id', auth.user.id)
        .single();

      if (member) query = query.eq('member_id', member.id);
    }

    const { data: orders, error: dbError, count } = await query;
    if (dbError) return error(res, dbError.message, 500);

    return ok(res, { orders, total: count });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Order Detail ---
async function handleOrderDetail(req, res, id) {
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);

  const { tracking_token } = req.query;

  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const column = isUUID ? 'id' : 'display_id';

    const { data: order, error: dbError } = await supabase
      .from('orders')
      .select('*, order_items(id, product_id, product_name, size_id, quantity, unit_price, subtotal)')
      .eq(column, id)
      .single();

    if (dbError || !order) return error(res, '注文が見つかりません', 404);

    const auth = await authenticateRequest(req);

    if (auth) {
      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('auth_user_id', auth.user.id)
        .single();

      const isOwner = member && order.member_id === member.id;
      const isStoreStaff = true; // TODO: implement store staff check
      if (!isOwner && !isStoreStaff) {
        return error(res, 'アクセス権限がありません', 403);
      }
    } else if (tracking_token) {
      if (order.tracking_token !== tracking_token) {
        return error(res, 'トラッキングトークンが無効です', 403);
      }
    } else {
      return error(res, '認証またはトラッキングトークンが必要です', 401);
    }

    return ok(res, { ...order });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Cancel ---
async function handleCancel(req, res, id) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_intent_id')
      .eq('id', id)
      .single();

    if (orderError || !order) return error(res, '注文が見つかりません', 404);
    if (order.status === 'cancelled') return error(res, 'この注文は既にキャンセルされています');

    if (order.payment_intent_id) {
      try {
        const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);

        if (pi.status === 'requires_capture') {
          await stripe.paymentIntents.cancel(order.payment_intent_id);
        } else if (pi.status === 'succeeded') {
          await stripe.refunds.create({ payment_intent: order.payment_intent_id });
        }
      } catch (stripeErr) {
        return error(res, '決済キャンセル/返金に失敗しました: ' + stripeErr.message, 500);
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select('id, status, updated_at')
      .single();

    if (updateError) return error(res, '更新に失敗しました: ' + updateError.message, 500);

    return ok(res, updated);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Status Update ---
async function handleStatus(req, res, id) {
  if (req.method !== 'PATCH') return error(res, 'Method not allowed', 405);

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { status } = req.body || {};
  const validStatuses = ['order_placed', 'accepted', 'preparing', 'prepared', 'delivering', 'delivered', 'picked_up', 'completed'];

  if (!status || !validStatuses.includes(status)) {
    return error(res, '有効なステータスを指定してください: ' + validStatuses.join(', '));
  }

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_intent_id, total_amount')
      .eq('id', id)
      .single();

    if (orderError || !order) return error(res, '注文が見つかりません', 404);

    if (status === 'prepared' && order.payment_intent_id) {
      try {
        await stripe.paymentIntents.capture(order.payment_intent_id);
      } catch (stripeErr) {
        return error(res, '決済キャプチャに失敗しました: ' + stripeErr.message, 500);
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select('id, status, total_amount, updated_at')
      .single();

    if (updateError) return error(res, '更新に失敗しました: ' + updateError.message, 500);

    return ok(res, {
      ...updated,
      payment_captured: status === 'prepared',
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}
