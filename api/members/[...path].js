import { supabase, createAnonClient } from '../_lib/supabase.js';
import { stripe } from '../_lib/stripe.js';
import { handleCors, ok, error } from '../_lib/response.js';
import { authenticateRequest, requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const pathSegments = req.query.path || [];

  // /api/members/login
  if (pathSegments[0] === 'login' && !pathSegments[1]) {
    return handleLogin(req, res);
  }

  // /api/members/login/line
  if (pathSegments[0] === 'login' && pathSegments[1] === 'line' && !pathSegments[2]) {
    return handleLineLogin(req, res);
  }

  // /api/members/login/line/callback
  if (pathSegments[0] === 'login' && pathSegments[1] === 'line' && pathSegments[2] === 'callback') {
    return handleLineCallback(req, res);
  }

  // /api/members/register
  if (pathSegments[0] === 'register') {
    return handleRegister(req, res);
  }

  // /api/members/[id]/card
  if (pathSegments[0] && pathSegments[1] === 'card') {
    return handleCard(req, res, pathSegments[0]);
  }

  // /api/members/[id]
  if (pathSegments[0]) {
    return handleMember(req, res, pathSegments[0]);
  }

  return error(res, 'Not found', 404);
}

// --- Login ---
async function handleLogin(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const { email, password } = req.body || {};
  if (!email || !password) {
    return error(res, 'メールアドレスとパスワードを入力してください');
  }

  try {
    const anonClient = createAnonClient();
    const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({ email, password });

    if (authError) {
      return error(res, 'メールアドレスまたはパスワードが正しくありません', 401);
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, phone, gender, address_prefecture, address_city, address_street, address_building, stripe_customer_id')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (memberError || !member) {
      return error(res, '会員情報が見つかりません', 404);
    }

    return ok(res, {
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
      member,
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Register ---
async function handleRegister(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const {
    email, password, first_name, last_name, phone,
    gender, birth_date,
    address_prefecture, address_city, address_street, address_building,
  } = req.body || {};

  if (!email || !password || !first_name || !last_name || !phone) {
    return error(res, '必須項目が不足しています（メール、パスワード、姓、名、電話番号）');
  }
  if (password.length < 8) {
    return error(res, 'パスワードは8文字以上で設定してください');
  }
  if (!email.includes('@')) {
    return error(res, '有効なメールアドレスを入力してください');
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return error(res, 'このメールアドレスは既に登録されています', 409);
      }
      return error(res, authError.message, 400);
    }

    const authUserId = authData.user.id;

    const memberData = { auth_user_id: authUserId, first_name, last_name, email, phone };
    if (gender) memberData.gender = gender;
    if (birth_date) memberData.birth_date = birth_date;
    if (address_prefecture) memberData.address_prefecture = address_prefecture;
    if (address_city) memberData.address_city = address_city;
    if (address_street) memberData.address_street = address_street;
    if (address_building) memberData.address_building = address_building;

    const { data: member, error: memberError } = await supabase
      .from('members')
      .insert(memberData)
      .select('id, email, first_name, last_name')
      .single();

    if (memberError) {
      await supabase.auth.admin.deleteUser(authUserId);
      return error(res, 'メンバー登録に失敗しました: ' + memberError.message, 500);
    }

    return ok(res, {
      member_id: member.id,
      email: member.email,
      first_name: member.first_name,
      last_name: member.last_name,
      message: '確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。',
    }, 201);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Member by ID ---
async function handleMember(req, res, id) {
  if (req.method === 'GET') {
    return handleMemberGet(req, res, id);
  } else if (req.method === 'PATCH') {
    return handleMemberPatch(req, res, id);
  }
  return error(res, 'Method not allowed', 405);
}

async function handleMemberGet(req, res, id) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { data: member, error: dbError } = await supabase
      .from('members')
      .select('id, auth_user_id, first_name, last_name, email, phone, gender, birth_date, address_prefecture, address_city, address_street, address_building, stripe_customer_id, line_user_id, created_at, updated_at')
      .eq('id', id)
      .single();

    if (dbError || !member) return error(res, '会員が見つかりません', 404);
    if (member.auth_user_id !== auth.user.id) return error(res, 'アクセス権限がありません', 403);

    const { auth_user_id, ...memberData } = member;
    return ok(res, memberData);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

async function handleMemberPatch(req, res, id) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { data: existing } = await supabase
      .from('members')
      .select('auth_user_id')
      .eq('id', id)
      .single();

    if (!existing || existing.auth_user_id !== auth.user.id) {
      return error(res, 'アクセス権限がありません', 403);
    }

    const allowedFields = [
      'first_name', 'last_name', 'phone', 'gender', 'birth_date',
      'address_prefecture', 'address_city', 'address_street', 'address_building',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return error(res, '更新するフィールドがありません');
    }

    const { data: updated, error: dbError } = await supabase
      .from('members')
      .update(updates)
      .eq('id', id)
      .select('id, first_name, last_name, email, phone, gender, birth_date, address_prefecture, address_city, address_street, address_building, stripe_customer_id, updated_at')
      .single();

    if (dbError) return error(res, '更新に失敗しました: ' + dbError.message, 500);

    return ok(res, updated);
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- Card ---
async function handleCard(req, res, memberId) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { data: member } = await supabase
    .from('members')
    .select('id, auth_user_id, stripe_customer_id')
    .eq('id', memberId)
    .single();

  if (!member || member.auth_user_id !== auth.user.id) {
    return error(res, 'アクセス権限がありません', 403);
  }

  if (req.method === 'POST') {
    return handleCreateSetupIntent(res, member);
  } else if (req.method === 'GET') {
    return handleListCards(res, member);
  } else if (req.method === 'DELETE') {
    return handleDeleteCard(req, res, member);
  }
  return error(res, 'Method not allowed', 405);
}

async function ensureStripeCustomer(member) {
  if (member.stripe_customer_id) return member.stripe_customer_id;

  const { data: fullMember } = await supabase
    .from('members')
    .select('email, first_name, last_name, phone')
    .eq('id', member.id)
    .single();

  const customer = await stripe.customers.create({
    email: fullMember?.email,
    name: (fullMember?.last_name || '') + ' ' + (fullMember?.first_name || ''),
    phone: fullMember?.phone,
    metadata: { aiden_member_id: member.id },
  });

  await supabase
    .from('members')
    .update({ stripe_customer_id: customer.id })
    .eq('id', member.id);

  member.stripe_customer_id = customer.id;
  return customer.id;
}

async function handleCreateSetupIntent(res, member) {
  try {
    const customerId = await ensureStripeCustomer(member);
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
    return ok(res, { client_secret: setupIntent.client_secret, customer_id: customerId });
  } catch (e) {
    return error(res, 'SetupIntent の作成に失敗しました: ' + e.message, 500);
  }
}

async function handleListCards(res, member) {
  try {
    if (!member.stripe_customer_id) return ok(res, { cards: [] });
    const paymentMethods = await stripe.paymentMethods.list({
      customer: member.stripe_customer_id,
      type: 'card',
    });
    const cards = paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      exp_month: pm.card.exp_month,
      exp_year: pm.card.exp_year,
    }));
    return ok(res, { cards });
  } catch (e) {
    return error(res, 'カード情報の取得に失敗しました: ' + e.message, 500);
  }
}

async function handleDeleteCard(req, res, member) {
  const { payment_method_id } = req.body || req.query || {};
  if (!payment_method_id) return error(res, 'payment_method_id が必要です');

  try {
    await stripe.paymentMethods.detach(payment_method_id);
    return ok(res, { deleted: true });
  } catch (e) {
    return error(res, 'カードの削除に失敗しました: ' + e.message, 500);
  }
}

// --- LINE Login ---
async function handleLineLogin(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  const { code } = req.body || {};
  if (!code) return error(res, 'LINE authorization code が必要です');

  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const callbackUrl = process.env.LINE_CALLBACK_URL;

  if (!channelId || !channelSecret || !callbackUrl) {
    return error(res, 'LINE Login の設定が不足しています', 500);
  }

  try {
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return error(res, 'LINEトークンの取得に失敗しました: ' + (tokenData.error_description || tokenData.error), 400);
    }

    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profileRes.ok || !profile.userId) {
      return error(res, 'LINEプロフィールの取得に失敗しました', 400);
    }

    const { data: existingMember } = await supabase
      .from('members')
      .select('id, auth_user_id, first_name, last_name, email, phone, gender, stripe_customer_id')
      .eq('line_user_id', profile.userId)
      .single();

    let member;
    let isNewUser = false;
    let authUserId;

    if (existingMember) {
      member = existingMember;
      authUserId = existingMember.auth_user_id;
    } else {
      isNewUser = true;
      const lineEmail = `line_${profile.userId}@aiden-line.local`;
      const linePassword = crypto.randomUUID();

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: lineEmail,
        password: linePassword,
        email_confirm: true,
        user_metadata: { line_user_id: profile.userId, display_name: profile.displayName },
      });

      if (authError) return error(res, 'アカウント作成に失敗しました: ' + authError.message, 500);
      authUserId = authData.user.id;

      const { data: newMember, error: memberError } = await supabase
        .from('members')
        .insert({
          auth_user_id: authUserId,
          line_user_id: profile.userId,
          first_name: profile.displayName || '',
          last_name: '',
          email: lineEmail,
        })
        .select('id, first_name, last_name, email, phone, gender, stripe_customer_id')
        .single();

      if (memberError) {
        await supabase.auth.admin.deleteUser(authUserId);
        return error(res, 'メンバー登録に失敗しました: ' + memberError.message, 500);
      }

      member = newMember;
    }

    const tempPassword = crypto.randomUUID();
    await supabase.auth.admin.updateUser(authUserId, { password: tempPassword });

    const anonClient = createAnonClient();
    const { data: loginData, error: loginError } = await anonClient.auth.signInWithPassword({
      email: member.email,
      password: tempPassword,
    });

    if (loginError) return error(res, 'セッション作成に失敗しました', 500);

    return ok(res, {
      access_token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
      expires_in: loginData.session.expires_in,
      member,
      is_new_user: isNewUser,
    });
  } catch (e) {
    return error(res, 'サーバーエラー: ' + e.message, 500);
  }
}

// --- LINE Callback ---
async function handleLineCallback(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'https://taiseiwolt.github.io/aiden-demo';

  if (!code) return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=missing_code');

  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const callbackUrl = process.env.LINE_CALLBACK_URL;

  if (!channelId || !channelSecret || !callbackUrl) {
    return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=server_config');
  }

  try {
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=token_failed');
    }

    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profileRes.ok || !profile.userId) {
      return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=profile_failed');
    }

    const { data: existingMember } = await supabase
      .from('members')
      .select('id, auth_user_id, first_name, last_name, email, phone, gender, stripe_customer_id')
      .eq('line_user_id', profile.userId)
      .single();

    let member;
    let isNewUser = false;
    let authUserId;

    if (existingMember) {
      member = existingMember;
      authUserId = existingMember.auth_user_id;
    } else {
      isNewUser = true;
      const lineEmail = `line_${profile.userId}@aiden-line.local`;
      const linePassword = crypto.randomUUID();

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: lineEmail,
        password: linePassword,
        email_confirm: true,
        user_metadata: { line_user_id: profile.userId, display_name: profile.displayName },
      });

      if (authError) return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=auth_create_failed');
      authUserId = authData.user.id;

      const { data: newMember, error: memberError } = await supabase
        .from('members')
        .insert({
          auth_user_id: authUserId,
          line_user_id: profile.userId,
          first_name: profile.displayName || '',
          last_name: '',
          email: lineEmail,
        })
        .select('id, first_name, last_name, email, phone, gender, stripe_customer_id')
        .single();

      if (memberError) {
        await supabase.auth.admin.deleteUser(authUserId);
        return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=member_create_failed');
      }

      member = newMember;
    }

    const anonClient = createAnonClient();
    const tempPassword = crypto.randomUUID();
    await supabase.auth.admin.updateUser(authUserId, { password: tempPassword });

    const { data: loginData, error: loginError } = await anonClient.auth.signInWithPassword({
      email: member.email,
      password: tempPassword,
    });

    if (loginError) return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=session_failed');

    const fragment = new URLSearchParams({
      access_token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
      member: JSON.stringify(member),
      is_new_user: String(isNewUser),
    }).toString();

    return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#' + fragment);
  } catch (e) {
    return res.redirect(302, frontendUrl + '/aiden-order-checkout.html#error=server_error');
  }
}
