import { useState, useEffect, useRef } from "react";

const BRAND_COLOR = "#D32F2F";
const BRAND_DARK = "#B71C1C";
const BRAND_LIGHT = "#FFEBEE";

const STATUS = {
  new: { label: "新規", color: "#D32F2F", bg: "#FFEBEE", icon: "●" },
  cooking: { label: "調理中", color: "#F57C00", bg: "#FFF3E0", icon: "●" },
  ready: { label: "完成", color: "#388E3C", bg: "#E8F5E9", icon: "●" },
  delivered: { label: "受渡済", color: "#757575", bg: "#F5F5F5", icon: "✓" },
  cancelled: { label: "キャンセル", color: "#9E9E9E", bg: "#FAFAFA", icon: "✕" },
};

const TYPE_ICON = { dine: "🍽", takeout: "🥡", delivery: "🛵" };
const TYPE_LABEL = { dine: "店内", takeout: "持帰り", delivery: "デリバリー" };

const SAMPLE_ORDERS = [
  { id: "0048", status: "new", type: "delivery", channel: "AIden", time: "16:30", total: 4100, items: [
    { name: "黒毛和牛 特上カルビ", qty: 1, price: 2800, options: ["焼き加減: ミディアムレア", "ガーリックバター +¥200"] },
    { name: "石焼ビビンバ", qty: 1, price: 900, options: [] },
  ], note: "玄関前に置いてください", customer: "東京都渋谷区道玄坂1-12-5", orderTime: "16:05" },
  { id: "0047", status: "new", type: "takeout", channel: "AIden", time: "16:15", total: 1800, items: [
    { name: "特上タン塩", qty: 2, price: 900, options: [] },
  ], note: "", customer: "", orderTime: "16:02" },
  { id: "0046", status: "new", type: "delivery", channel: "AIden", time: "16:45", total: 5200, items: [
    { name: "炭火コース", qty: 1, price: 4800, options: [] },
    { name: "ガーリックバター", qty: 2, price: 200, options: [] },
  ], note: "インターホンを鳴らしてください", customer: "東京都渋谷区恵比寿1-3-8", orderTime: "16:00" },
  { id: "0045", status: "cooking", type: "takeout", channel: "AIden", time: "16:00", total: 2400, items: [
    { name: "黒毛和牛 上ロース", qty: 1, price: 2200, options: [] },
    { name: "ガーリックバター", qty: 1, price: 200, options: [] },
  ], note: "", customer: "", orderTime: "15:42" },
  { id: "0044", status: "cooking", type: "dine", channel: "AIden QR", time: "—", total: 5400, items: [
    { name: "炭火コース", qty: 1, price: 4800, options: [] },
    { name: "ドリンクセット", qty: 1, price: 600, options: [] },
  ], note: "テーブル3", customer: "", orderTime: "15:38" },
  { id: "0043", status: "cooking", type: "delivery", channel: "AIden", time: "16:10", total: 3600, items: [
    { name: "特上タン塩", qty: 2, price: 900, options: [] },
    { name: "石焼ビビンバ", qty: 2, price: 900, options: [] },
  ], note: "", customer: "東京都渋谷区桜丘町2-5", orderTime: "15:35" },
  { id: "0042", status: "ready", type: "takeout", channel: "AIden", time: "15:45", total: 1200, items: [
    { name: "ハラミ", qty: 1, price: 1200, options: [] },
  ], note: "", customer: "", orderTime: "15:20" },
  { id: "0041", status: "ready", type: "delivery", channel: "AIden", time: "15:50", total: 2800, items: [
    { name: "黒毛和牛 特上カルビ", qty: 1, price: 2800, options: [] },
  ], note: "", customer: "東京都渋谷区宇田川町3-1", orderTime: "15:15" },
  { id: "0040", status: "delivered", type: "takeout", channel: "AIden", time: "15:30", total: 900, items: [
    { name: "石焼ビビンバ", qty: 1, price: 900, options: [] },
  ], note: "", customer: "", orderTime: "15:00" },
  { id: "0039", status: "delivered", type: "dine", channel: "AIden QR", time: "—", total: 9600, items: [
    { name: "炭火コース", qty: 2, price: 4800, options: [] },
  ], note: "", customer: "", orderTime: "14:30" },
  { id: "0038", status: "cancelled", type: "delivery", channel: "AIden", time: "15:20", total: 3200, items: [
    { name: "黒毛和牛 上ロース", qty: 1, price: 2200, options: [] },
    { name: "冷麺", qty: 1, price: 880, options: [] },
  ], note: "", customer: "", orderTime: "14:50" },
];

const NAV_ITEMS = [
  { id: "orders", icon: "📋", label: "注文" },
  { id: "reserve", icon: "📅", label: "予約" },
  { id: "soldout", icon: "🚫", label: "品切れ" },
  { id: "history", icon: "📊", label: "履歴" },
  { id: "settings", icon: "⚙", label: "設定" },
];

const FILTERS = [
  { id: "all", label: "すべて" },
  { id: "new", label: "新規" },
  { id: "cooking", label: "調理中" },
  { id: "ready", label: "完成" },
  { id: "delivered", label: "受渡済" },
];

export default function App() {
  const [orders, setOrders] = useState(SAMPLE_ORDERS);
  const [activeNav, setActiveNav] = useState("orders");
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [newOrderPopup, setNewOrderPopup] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseMenu, setPauseMenu] = useState(false);
  const [printerOk, setPrinterOk] = useState(true);
  const [cancelDialog, setCancelDialog] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const bellRef = useRef(null);

  const newCount = orders.filter(o => o.status === "new").length;
  const soldoutCount = 1;

  const filtered = activeFilter === "all"
    ? orders.filter(o => o.status !== "cancelled")
    : orders.filter(o => o.status === activeFilter);

  const simulateNewOrder = () => {
    const o = {
      id: String(parseInt(orders[0]?.id || "0") + 1).padStart(4, "0"),
      status: "new", type: ["delivery", "takeout", "dine"][Math.floor(Math.random() * 3)],
      channel: "AIden", time: "17:00", total: 3400,
      items: [{ name: "黒毛和牛 特上カルビ", qty: 1, price: 2800, options: [] }, { name: "ガーリックバター", qty: 3, price: 200, options: [] }],
      note: "", customer: "東京都渋谷区神南1-2-3", orderTime: new Date().toTimeString().slice(0, 5),
    };
    setNewOrderPopup(o);
  };

  const acceptOrder = (order) => {
    setOrders(prev => [{ ...order, status: "cooking" }, ...prev]);
    setNewOrderPopup(null);
  };

  const rejectOrder = () => {
    setCancelDialog(newOrderPopup);
  };

  const confirmCancel = (reason) => {
    if (cancelDialog) {
      const o = cancelDialog;
      if (newOrderPopup && newOrderPopup.id === o.id) {
        setOrders(prev => [{ ...o, status: "cancelled" }, ...prev]);
        setNewOrderPopup(null);
      } else {
        setOrders(prev => prev.map(x => x.id === o.id ? { ...x, status: "cancelled" } : x));
        setShowDetail(null);
      }
      setCancelDialog(null);
    }
  };

  const advanceStatus = (id) => {
    const flow = ["new", "cooking", "ready", "delivered"];
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o;
      const idx = flow.indexOf(o.status);
      if (idx < flow.length - 1) return { ...o, status: flow[idx + 1] };
      return o;
    }));
    setShowDetail(null);
  };

  const nextStatusLabel = (status) => {
    const map = { new: "受注する", cooking: "完成にする", ready: "受渡済にする" };
    return map[status] || null;
  };

  const font = `'Noto Sans JP', 'Hiragino Kaku Gothic ProN', -apple-system, sans-serif`;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", fontFamily: font, overflow: "hidden", background: "#F0F0F0" }}>
      {/* Sidebar */}
      <div style={{ width: 72, background: "#1A1A1A", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, flexShrink: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: BRAND_COLOR, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 24 }}>🔥</div>
        {NAV_ITEMS.map(n => {
          const active = n.id === activeNav;
          const badge = n.id === "orders" ? newCount : n.id === "soldout" ? soldoutCount : 0;
          return (
            <div key={n.id} onClick={() => setActiveNav(n.id)}
              style={{ width: 56, padding: "10px 0", borderRadius: 12, textAlign: "center", cursor: "pointer", position: "relative",
                background: active ? "rgba(255,255,255,0.12)" : "transparent", marginBottom: 4, transition: "background 0.15s" }}>
              <div style={{ fontSize: 22 }}>{n.icon}</div>
              <div style={{ fontSize: 9, color: active ? "#fff" : "#888", marginTop: 2, fontWeight: active ? 700 : 400 }}>{n.label}</div>
              {badge > 0 && (
                <div style={{ position: "absolute", top: 4, right: 6, minWidth: 18, height: 18, borderRadius: 9, background: BRAND_COLOR,
                  color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{badge}</div>
              )}
            </div>
          );
        })}
        {/* Simulate new order button */}
        <div style={{ marginTop: "auto", marginBottom: 16 }}>
          <div onClick={simulateNewOrder}
            style={{ width: 48, height: 48, borderRadius: 12, background: "#333", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: 11, color: "#aaa", textAlign: "center", lineHeight: 1.2 }}>
            🔔<br/>テスト
          </div>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ height: 56, background: isPaused ? "#B71C1C" : "#fff", display: "flex", alignItems: "center", padding: "0 20px",
          borderBottom: isPaused ? "none" : "1px solid #E0E0E0", transition: "background 0.3s", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: isPaused ? "#fff" : "#1A1A1A", letterSpacing: -0.5 }}>
            炭火亭 渋谷店
          </div>
          {isPaused && <div style={{ marginLeft: 12, fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>⏸ 一時休止中</div>}
          <div style={{ flex: 1 }} />

          {/* Printer status */}
          <div onClick={() => setPrinterOk(!printerOk)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
              background: isPaused ? "rgba(255,255,255,0.15)" : "#F5F5F5", marginRight: 8 }}>
            <span style={{ fontSize: 16 }}>🖨</span>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: printerOk ? "#4CAF50" : "#F44336" }} />
            <span style={{ fontSize: 12, color: isPaused ? "#fff" : "#666", fontWeight: 500 }}>{printerOk ? "接続中" : "未接続"}</span>
          </div>

          {/* Notification badge */}
          <div style={{ position: "relative", padding: "6px 12px", borderRadius: 8, background: isPaused ? "rgba(255,255,255,0.15)" : "#F5F5F5", marginRight: 8 }}>
            <span style={{ fontSize: 16 }}>🔔</span>
            {newCount > 0 && (
              <span style={{ position: "absolute", top: 2, right: 4, minWidth: 16, height: 16, borderRadius: 8, background: BRAND_COLOR,
                color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{newCount}</span>
            )}
          </div>

          {/* Pause toggle */}
          <div style={{ position: "relative" }}>
            <div onClick={() => isPaused ? (setIsPaused(false), setPauseMenu(false)) : setPauseMenu(!pauseMenu)}
              style={{ padding: "6px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "all 0.2s",
                background: isPaused ? "#fff" : BRAND_COLOR, color: isPaused ? BRAND_COLOR : "#fff" }}>
              {isPaused ? "▶ 受付再開" : "⏸ 受付中"}
            </div>
            {pauseMenu && !isPaused && (
              <div style={{ position: "absolute", top: 44, right: 0, background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                padding: 8, zIndex: 100, width: 200 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#666", padding: "8px 12px" }}>一時休止</div>
                {["10分間", "30分間", "60分間", "本日以降"].map(t => (
                  <div key={t} onClick={() => { setIsPaused(true); setPauseMenu(false); }}
                    style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#333" }}
                    onMouseEnter={e => e.target.style.background = "#F5F5F5"} onMouseLeave={e => e.target.style.background = "transparent"}>
                    {t}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 20px", flexShrink: 0 }}>
          {FILTERS.map(f => {
            const active = f.id === activeFilter;
            const count = f.id === "all" ? orders.filter(o => o.status !== "cancelled").length : orders.filter(o => o.status === f.id).length;
            return (
              <div key={f.id} onClick={() => setActiveFilter(f.id)}
                style={{ padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 700, transition: "all 0.15s",
                  background: active ? "#1A1A1A" : "#fff", color: active ? "#fff" : "#555", border: active ? "none" : "1px solid #DDD" }}>
                {f.label}
                {count > 0 && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.75 }}>({count})</span>}
                {f.id === "new" && count > 0 && (
                  <span style={{ marginLeft: 6, width: 8, height: 8, borderRadius: 4, background: active ? BRAND_COLOR : BRAND_COLOR,
                    display: "inline-block", animation: "pulse 1.5s infinite" }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Order cards grid */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 20px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {filtered.map(order => {
              const s = STATUS[order.status];
              return (
                <div key={order.id} onClick={() => setShowDetail(order)}
                  style={{ background: "#fff", borderRadius: 14, padding: 16, cursor: "pointer", transition: "all 0.15s",
                    border: order.status === "new" ? `2px solid ${BRAND_COLOR}` : "2px solid transparent",
                    boxShadow: order.status === "new" ? `0 0 0 3px ${BRAND_LIGHT}` : "0 1px 4px rgba(0,0,0,0.06)",
                    position: "relative", overflow: "hidden" }}>
                  {/* Status strip */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: s.color }} />

                  {/* Header row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: s.color, background: s.bg, padding: "3px 8px", borderRadius: 6 }}>
                        {s.icon} {s.label}
                      </span>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#1A1A1A", letterSpacing: -1 }}>#{order.id}</span>
                  </div>

                  {/* Type + channel */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{TYPE_ICON[order.type]}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>{TYPE_LABEL[order.type]}</span>
                    <span style={{ fontSize: 11, color: "#999", fontWeight: 500 }}>{order.channel}</span>
                  </div>

                  {/* Time */}
                  {order.time !== "—" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "#999" }}>受渡</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "#1A1A1A" }}>{order.time}</span>
                    </div>
                  )}

                  {/* Items preview */}
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 10, lineHeight: 1.6 }}>
                    {order.items.slice(0, 2).map((item, i) => (
                      <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.name} ×{item.qty}
                      </div>
                    ))}
                    {order.items.length > 2 && <div style={{ color: "#bbb" }}>他 {order.items.length - 2}品</div>}
                  </div>

                  {/* Total */}
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#1A1A1A", letterSpacing: -0.5 }}>
                    ¥{order.total.toLocaleString()}
                  </div>

                  {/* Note indicator */}
                  {order.note && (
                    <div style={{ marginTop: 8, fontSize: 11, color: BRAND_COLOR, fontWeight: 600 }}>📝 メモあり</div>
                  )}

                  {/* Quick action */}
                  {nextStatusLabel(order.status) && (
                    <div onClick={(e) => { e.stopPropagation(); advanceStatus(order.id); }}
                      style={{ marginTop: 12, padding: "8px 0", borderRadius: 8, textAlign: "center", fontWeight: 700, fontSize: 13, cursor: "pointer",
                        background: order.status === "new" ? BRAND_COLOR : "#1A1A1A", color: "#fff", transition: "opacity 0.15s" }}
                      onMouseEnter={e => e.target.style.opacity = 0.85} onMouseLeave={e => e.target.style.opacity = 1}>
                      {nextStatusLabel(order.status)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* New Order Popup */}
      {newOrderPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#fff", borderRadius: 20, width: 480, maxHeight: "85vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
            {/* Popup header */}
            <div style={{ background: BRAND_COLOR, padding: "20px 24px", borderRadius: "20px 20px 0 0", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>🔔</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>新しい注文が入りました</div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {/* Order info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div style={{ background: "#F8F8F8", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>注文番号</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>#{newOrderPopup.id}</div>
                </div>
                <div style={{ background: "#F8F8F8", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>合計</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>¥{newOrderPopup.total.toLocaleString()}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, background: "#F8F8F8", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>種別</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{TYPE_ICON[newOrderPopup.type]} {TYPE_LABEL[newOrderPopup.type]}</div>
                </div>
                <div style={{ flex: 1, background: "#F8F8F8", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>受渡予定</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{newOrderPopup.time}</div>
                </div>
                <div style={{ flex: 1, background: "#F8F8F8", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>媒体</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{newOrderPopup.channel}</div>
                </div>
              </div>

              {/* Items */}
              <div style={{ borderTop: "1px solid #EEE", paddingTop: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#999", marginBottom: 8 }}>注文内容</div>
                {newOrderPopup.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14 }}>
                    <span style={{ fontWeight: 600 }}>{item.name} <span style={{ color: "#999" }}>×{item.qty}</span></span>
                    <span style={{ fontWeight: 700 }}>¥{(item.price * item.qty).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {/* Note */}
              {newOrderPopup.note && (
                <div style={{ background: "#FFF8E1", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>📝 お客様メモ: </span>{newOrderPopup.note}
                </div>
              )}

              {/* Delivery address */}
              {newOrderPopup.type === "delivery" && newOrderPopup.customer && (
                <div style={{ background: "#F3F8FF", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>📍 お届け先: </span>{newOrderPopup.customer}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <div onClick={rejectOrder}
                  style={{ flex: 1, padding: "14px 0", borderRadius: 12, textAlign: "center", fontWeight: 800, fontSize: 16, cursor: "pointer",
                    background: "#F5F5F5", color: "#666", transition: "background 0.15s" }}
                  onMouseEnter={e => e.target.style.background = "#EEE"} onMouseLeave={e => e.target.style.background = "#F5F5F5"}>
                  キャンセル
                </div>
                <div onClick={() => acceptOrder(newOrderPopup)}
                  style={{ flex: 2, padding: "14px 0", borderRadius: 12, textAlign: "center", fontWeight: 800, fontSize: 16, cursor: "pointer",
                    background: BRAND_COLOR, color: "#fff", transition: "opacity 0.15s" }}
                  onMouseEnter={e => e.target.style.opacity = 0.9} onMouseLeave={e => e.target.style.opacity = 1}>
                  ✅ 受注する
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel dialog */}
      {cancelDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: 380, padding: 24, boxShadow: "0 16px 48px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>キャンセル理由</div>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 16 }}>#{cancelDialog.id} のキャンセル理由を選択してください</div>
            {["品切れ", "営業時間外", "店舗都合", "その他"].map(r => (
              <div key={r} onClick={() => confirmCancel(r)}
                style={{ padding: "12px 16px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600, marginBottom: 6,
                  border: "1px solid #EEE", transition: "background 0.15s" }}
                onMouseEnter={e => e.target.style.background = "#F5F5F5"} onMouseLeave={e => e.target.style.background = "#fff"}>
                {r}
              </div>
            ))}
            <div onClick={() => setCancelDialog(null)}
              style={{ marginTop: 8, padding: "10px 0", textAlign: "center", fontSize: 13, color: "#999", cursor: "pointer" }}>
              戻る
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Slide-in */}
      {showDetail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "flex-end", zIndex: 900 }}
          onClick={() => setShowDetail(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 420, height: "100%", background: "#fff", boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", overflow: "auto" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #EEE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div onClick={() => setShowDetail(null)} style={{ fontSize: 14, color: "#999", cursor: "pointer", fontWeight: 600 }}>← 戻る</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>#{showDetail.id}</div>
              <div style={{ fontSize: 13, color: BRAND_COLOR, fontWeight: 700, cursor: "pointer" }}>🖨 再印刷</div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {/* Status */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>ステータス</div>
                <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                  {["new", "cooking", "ready", "delivered"].map((st, i) => {
                    const flow = ["new", "cooking", "ready", "delivered"];
                    const currentIdx = flow.indexOf(showDetail.status);
                    const done = i <= currentIdx;
                    return (
                      <div key={st} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: "100%", height: 4, borderRadius: 2, background: done ? STATUS[st].color : "#E0E0E0", marginBottom: 4 }} />
                        <span style={{ fontSize: 10, fontWeight: done ? 700 : 400, color: done ? STATUS[st].color : "#CCC" }}>{STATUS[st].label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[
                  ["注文種別", `${TYPE_ICON[showDetail.type]} ${TYPE_LABEL[showDetail.type]}`],
                  ["受注媒体", showDetail.channel],
                  ["注文日時", showDetail.orderTime],
                  ["受渡予定", showDetail.time],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: "#F8F8F8", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Items */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#999", marginBottom: 8 }}>注文内容</div>
                {showDetail.items.map((item, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span style={{ fontWeight: 600 }}>{item.name} <span style={{ color: "#999" }}>×{item.qty}</span></span>
                      <span style={{ fontWeight: 700 }}>¥{(item.price * item.qty).toLocaleString()}</span>
                    </div>
                    {item.options && item.options.map((opt, j) => (
                      <div key={j} style={{ fontSize: 12, color: "#888", paddingLeft: 12, marginTop: 2 }}>└ {opt}</div>
                    ))}
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #EEE", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>合計</span>
                  <span style={{ fontWeight: 800, fontSize: 18 }}>¥{showDetail.total.toLocaleString()}</span>
                </div>
              </div>

              {/* Note */}
              {showDetail.note && (
                <div style={{ background: "#FFF8E1", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>📝 </span>{showDetail.note}
                </div>
              )}

              {/* Delivery address */}
              {showDetail.type === "delivery" && showDetail.customer && (
                <div style={{ background: "#F3F8FF", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>📍 お届け先: </span>{showDetail.customer}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {nextStatusLabel(showDetail.status) && (
                  <div onClick={() => advanceStatus(showDetail.id)}
                    style={{ padding: "14px 0", borderRadius: 12, textAlign: "center", fontWeight: 800, fontSize: 15, cursor: "pointer",
                      background: "#1A1A1A", color: "#fff" }}>
                    {nextStatusLabel(showDetail.status)}
                  </div>
                )}
                {showDetail.status !== "delivered" && showDetail.status !== "cancelled" && (
                  <div onClick={() => setCancelDialog(showDetail)}
                    style={{ padding: "12px 0", borderRadius: 12, textAlign: "center", fontWeight: 700, fontSize: 13, cursor: "pointer",
                      color: "#D32F2F", background: "#FFEBEE" }}>
                    この注文をキャンセル
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #DDD; border-radius: 3px; }
      `}</style>
    </div>
  );
}
