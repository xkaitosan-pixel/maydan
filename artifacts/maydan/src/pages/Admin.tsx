import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { CATEGORIES } from "@/lib/questions";
import type { Question } from "@/lib/questions";

const SUPER_ADMIN = "xkaito.san@gmail.com";

type AdminRecord = { id: string; email: string; name: string; is_super: boolean; created_at: string };
type EditableQ = Question & { _new?: boolean };

function badge(d: string) {
  return d === "easy"
    ? "bg-green-900/60 text-green-300"
    : d === "medium"
    ? "bg-yellow-900/60 text-yellow-300"
    : "bg-red-900/60 text-red-300";
}
function diffLabel(d: string) {
  return d === "easy" ? "سهل" : d === "medium" ? "متوسط" : "صعب";
}

// ─── Edit / Add Modal ────────────────────────────────────────────────────────
function QuestionModal({
  initial,
  mode,
  onSave,
  onClose,
  saving,
}: {
  initial: Partial<EditableQ>;
  mode: "edit" | "add";
  onSave: (q: EditableQ) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Partial<EditableQ>>({
    question: "",
    options: ["", "", "", ""],
    correct: 0,
    category: "islamic",
    difficulty: "easy",
    ...initial,
  });

  function setOption(i: number, val: string) {
    const opts = [...(draft.options ?? ["", "", "", ""])];
    opts[i] = val;
    setDraft((p) => ({ ...p, options: opts }));
  }

  function validate() {
    if (!draft.question?.trim()) return "أدخل نص السؤال";
    if ((draft.options ?? []).some((o) => !o.trim())) return "أدخل جميع الإجابات الأربع";
    return null;
  }

  function handleSave() {
    const err = validate();
    if (err) { alert(err); return; }
    onSave(draft as EditableQ);
  }

  const isCorrect = (i: number) => draft.correct === i;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "hsl(220 20% 12%)" }}
        dir="rtl"
      >
        {/* Modal header */}
        <div
          className="px-6 py-4 flex items-center justify-between border-b border-white/10"
          style={{ background: "hsl(220 20% 14%)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{mode === "edit" ? "✏️" : "➕"}</span>
            <h2 className="text-white font-bold text-base">
              {mode === "edit" ? `تعديل السؤال #${draft.id}` : "إضافة سؤال جديد"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Question text */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block">
              📝 نص السؤال <span className="text-red-400">*</span>
            </label>
            <textarea
              value={draft.question ?? ""}
              onChange={(e) => setDraft((p) => ({ ...p, question: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl text-sm text-white border border-white/10 resize-none leading-relaxed"
              style={{ background: "hsl(220 20% 18%)" }}
              rows={3}
              placeholder="اكتب نص السؤال هنا..."
              autoFocus
            />
          </div>

          {/* Answer options */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-3 block">
              🎯 الإجابات — اضغط على ✓ لتحديد الإجابة الصحيحة
            </label>
            <div className="space-y-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2 items-center">
                  {/* Correct-answer toggle */}
                  <button
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, correct: i }))}
                    className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold transition-all border-2 ${
                      isCorrect(i)
                        ? "border-yellow-400 bg-yellow-400 text-black scale-110"
                        : "border-white/20 text-white/30 hover:border-white/40"
                    }`}
                    title="حدد كإجابة صحيحة"
                  >
                    {isCorrect(i) ? "✓" : i + 1}
                  </button>

                  <input
                    value={(draft.options ?? [])[i] ?? ""}
                    onChange={(e) => setOption(i, e.target.value)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm text-white border transition-colors ${
                      isCorrect(i)
                        ? "border-yellow-400/60 bg-yellow-900/20"
                        : "border-white/10"
                    }`}
                    style={isCorrect(i) ? {} : { background: "hsl(220 20% 18%)" }}
                    placeholder={
                      isCorrect(i) ? `الإجابة الصحيحة` : `إجابة خاطئة ${i}`
                    }
                  />

                  {isCorrect(i) && (
                    <span className="text-yellow-400 text-xs font-bold flex-shrink-0">✅</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Category + Difficulty */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-white/60 mb-2 block">🗂️ الفئة</label>
              <select
                value={draft.category ?? "islamic"}
                onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white border border-white/10"
                style={{ background: "hsl(220 20% 18%)" }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-2 block">📊 الصعوبة</label>
              <select
                value={draft.difficulty ?? "easy"}
                onChange={(e) => setDraft((p) => ({ ...p, difficulty: e.target.value as any }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white border border-white/10"
                style={{ background: "hsl(220 20% 18%)" }}
              >
                <option value="easy">🟢 سهل</option>
                <option value="medium">🟡 متوسط</option>
                <option value="hard">🔴 صعب</option>
              </select>
            </div>
          </div>

          {/* Image URL */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block">
              🖼️ رابط الصورة <span className="text-white/30">(اختياري)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={draft.image_url ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, image_url: e.target.value || undefined }))}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm text-white border border-white/10"
                style={{ background: "hsl(220 20% 18%)" }}
                placeholder="https://..."
                dir="ltr"
              />
              {draft.image_url && (
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, image_url: undefined }))}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 border border-white/10 flex-shrink-0"
                  title="حذف الصورة"
                >
                  ✕
                </button>
              )}
            </div>
            {draft.image_url && (
              <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center" style={{ minHeight: 80 }}>
                <img
                  src={draft.image_url}
                  alt="معاينة"
                  className="max-h-40 object-contain rounded-xl"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Modal footer */}
        <div
          className="px-6 py-4 flex gap-3 border-t border-white/10"
          style={{ background: "hsl(220 20% 14%)" }}
        >
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl font-bold text-black text-sm transition-opacity disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
          >
            {saving ? "⏳ جاري الحفظ..." : "💾 حفظ السؤال"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl font-bold text-white/70 text-sm border border-white/15 hover:border-white/30"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Store Manager Section ────────────────────────────────────────────────────
type StoreItem = {
  id: string;
  name: string;
  type: "frame" | "title" | "powercard";
  price: number;
  css_effect: string | null;
  icon: string | null;
  is_premium: boolean;
  is_visible: boolean;
  created_at?: string;
};

const TYPE_LABEL: Record<StoreItem["type"], string> = {
  frame: "🖼️ إطار",
  title: "🏷️ لقب",
  powercard: "🃏 بطاقة قوة",
};

function emptyDraft(): Omit<StoreItem, "id" | "created_at"> {
  return {
    name: "",
    type: "frame",
    price: 100,
    css_effect: "",
    icon: "✨",
    is_premium: false,
    is_visible: true,
  };
}

function StoreManager() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<StoreItem>>({});

  const [draft, setDraft] = useState(emptyDraft());
  const [adding, setAdding] = useState(false);

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    setLoading(true);
    setErr("");
    const { data, error } = await supabase
      .from("store_items")
      .select("*")
      .order("type")
      .order("price");
    if (error) {
      setErr(
        error.code === "42P01" || /relation .* does not exist/i.test(error.message)
          ? "جدول store_items غير موجود. شغّل سكريبت SQL لإنشائه أولاً."
          : error.message,
      );
      setItems([]);
    } else {
      setItems((data ?? []) as StoreItem[]);
    }
    setLoading(false);
  }

  function flash(msg: string, isErr = false) {
    if (isErr) { setErr(msg); setInfo(""); }
    else { setInfo(msg); setErr(""); }
    setTimeout(() => { setInfo(""); }, 2500);
  }

  async function addItem() {
    setErr("");
    const name = draft.name.trim();
    if (!name) { setErr("أدخل اسم العنصر"); return; }
    if (draft.price < 0) { setErr("السعر يجب أن يكون 0 أو أكثر"); return; }
    setAdding(true);
    const { data, error } = await supabase
      .from("store_items")
      .insert({
        name,
        type: draft.type,
        price: Math.round(draft.price),
        css_effect: draft.css_effect?.trim() || null,
        icon: draft.icon?.trim() || null,
        is_premium: draft.is_premium,
        is_visible: draft.is_visible,
      })
      .select()
      .single();
    setAdding(false);
    if (error) { flash(error.message, true); return; }
    setItems((prev) => [...prev, data as StoreItem]);
    setDraft(emptyDraft());
    flash(`✅ تمت إضافة "${name}"`);
  }

  function startEdit(item: StoreItem) {
    setEditId(item.id);
    setEditDraft({ ...item });
  }
  function cancelEdit() { setEditId(null); setEditDraft({}); }

  async function saveEdit() {
    if (!editId) return;
    const d = editDraft;
    if (!d.name?.trim()) { flash("الاسم مطلوب", true); return; }
    setBusyId(editId);
    const { error } = await supabase
      .from("store_items")
      .update({
        name: d.name.trim(),
        type: d.type,
        price: Math.round(Number(d.price ?? 0)),
        css_effect: (d.css_effect ?? "").trim() || null,
        icon: (d.icon ?? "").trim() || null,
        is_premium: !!d.is_premium,
        is_visible: !!d.is_visible,
      })
      .eq("id", editId);
    setBusyId(null);
    if (error) { flash(error.message, true); return; }
    setItems((prev) => prev.map((x) => (x.id === editId ? { ...(x as StoreItem), ...(d as StoreItem) } : x)));
    cancelEdit();
    flash("✅ تم حفظ التعديلات");
  }

  async function toggleVisible(item: StoreItem) {
    setBusyId(item.id);
    const { error } = await supabase
      .from("store_items")
      .update({ is_visible: !item.is_visible })
      .eq("id", item.id);
    setBusyId(null);
    if (error) { flash(error.message, true); return; }
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, is_visible: !item.is_visible } : x)));
  }

  async function deleteItem(item: StoreItem) {
    if (!confirm(`حذف "${item.name}" نهائياً؟`)) return;
    setBusyId(item.id);
    const { error } = await supabase.from("store_items").delete().eq("id", item.id);
    setBusyId(null);
    if (error) { flash(error.message, true); return; }
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    flash(`🗑️ تم حذف "${item.name}"`);
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 overflow-hidden" style={{ background: "hsl(40 30% 8%)" }}>
      <div className="px-5 py-4 border-b border-amber-500/20 flex items-center gap-3" style={{ background: "hsl(40 30% 10%)" }}>
        <span className="text-xl">🛍️</span>
        <h2 className="text-white font-bold">إدارة المتجر</h2>
        <span className="mr-auto text-xs px-2 py-0.5 rounded-full bg-amber-900/50 text-amber-300">
          {items.length} عنصر
        </span>
        <button
          onClick={fetchItems}
          className="text-xs px-3 py-1 rounded-lg border border-white/15 text-white/70 hover:border-white/30"
        >
          🔄 تحديث
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Add new item */}
        <div className="rounded-xl border border-white/10 p-4 space-y-3" style={{ background: "hsl(220 20% 12%)" }}>
          <p className="text-sm text-white/70 font-bold">➕ إضافة عنصر جديد</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1 block">الاسم (عربي) *</label>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="إطار ذهبي متوهج"
                className="w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10"
                style={{ background: "hsl(220 20% 16%)" }}
              />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">النوع</label>
              <select
                value={draft.type}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as StoreItem["type"] }))}
                className="w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10"
                style={{ background: "hsl(220 20% 16%)" }}
              >
                <option value="frame">🖼️ إطار (frame)</option>
                <option value="title">🏷️ لقب (title)</option>
                <option value="powercard">🃏 بطاقة قوة (powercard)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">السعر بالعملات 🪙</label>
              <input
                type="number"
                min={0}
                value={draft.price}
                onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10"
                style={{ background: "hsl(220 20% 16%)" }}
              />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">الأيقونة (إيموجي)</label>
              <input
                value={draft.icon ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
                placeholder="✨"
                className="w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10"
                style={{ background: "hsl(220 20% 16%)" }}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-white/50 mb-1 block">CSS effect (اختياري)</label>
              <input
                value={draft.css_effect ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, css_effect: e.target.value }))}
                placeholder="border: 3px solid #f59e0b; box-shadow: 0 0 18px #f59e0bcc;"
                dir="ltr"
                className="w-full px-3 py-2 rounded-lg text-xs text-white font-mono border border-white/10"
                style={{ background: "hsl(220 20% 16%)" }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.is_premium}
                onChange={(e) => setDraft((d) => ({ ...d, is_premium: e.target.checked }))}
              />
              👑 للأعضاء المميزين فقط
            </label>
            <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.is_visible}
                onChange={(e) => setDraft((d) => ({ ...d, is_visible: e.target.checked }))}
              />
              👁️ ظاهر في المتجر
            </label>
            <button
              onClick={addItem}
              disabled={adding}
              className="mr-auto px-5 py-2 rounded-xl font-bold text-sm text-black disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
            >
              {adding ? "..." : "💾 حفظ"}
            </button>
          </div>
        </div>

        {/* Status */}
        {err && <p className="text-red-400 text-xs">⚠️ {err}</p>}
        {info && <p className="text-green-400 text-xs">{info}</p>}

        {/* Items table */}
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ background: "hsl(220 20% 14%)" }}>
                  <th className="px-3 py-2 text-right text-white/40 font-medium w-12">أيقونة</th>
                  <th className="px-3 py-2 text-right text-white/40 font-medium">الاسم</th>
                  <th className="px-3 py-2 text-right text-white/40 font-medium">النوع</th>
                  <th className="px-3 py-2 text-right text-white/40 font-medium">السعر</th>
                  <th className="px-3 py-2 text-right text-white/40 font-medium hidden md:table-cell">CSS</th>
                  <th className="px-3 py-2 text-right text-white/40 font-medium">حالة</th>
                  <th className="px-3 py-2 text-right text-white/40 font-medium w-32">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-white/40 text-sm">جاري التحميل...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-white/40 text-sm">لا توجد عناصر بعد</td></tr>
                ) : items.map((it) => {
                  const isEditing = editId === it.id;
                  if (isEditing) {
                    return (
                      <tr key={it.id} style={{ background: "hsl(220 20% 16%)" }}>
                        <td className="px-3 py-2">
                          <input
                            value={editDraft.icon ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, icon: e.target.value }))}
                            className="w-12 px-2 py-1 rounded text-sm text-white border border-white/10 text-center"
                            style={{ background: "hsl(220 20% 12%)" }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={editDraft.name ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                            className="w-full px-2 py-1 rounded text-sm text-white border border-white/10"
                            style={{ background: "hsl(220 20% 12%)" }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={editDraft.type ?? "frame"}
                            onChange={(e) => setEditDraft((d) => ({ ...d, type: e.target.value as StoreItem["type"] }))}
                            className="px-2 py-1 rounded text-xs text-white border border-white/10"
                            style={{ background: "hsl(220 20% 12%)" }}
                          >
                            <option value="frame">إطار</option>
                            <option value="title">لقب</option>
                            <option value="powercard">بطاقة</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={editDraft.price ?? 0}
                            onChange={(e) => setEditDraft((d) => ({ ...d, price: Number(e.target.value) }))}
                            className="w-20 px-2 py-1 rounded text-sm text-white border border-white/10"
                            style={{ background: "hsl(220 20% 12%)" }}
                          />
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          <input
                            value={editDraft.css_effect ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, css_effect: e.target.value }))}
                            dir="ltr"
                            className="w-full px-2 py-1 rounded text-xs text-white font-mono border border-white/10"
                            style={{ background: "hsl(220 20% 12%)" }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-white/70 flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={!!editDraft.is_premium}
                                onChange={(e) => setEditDraft((d) => ({ ...d, is_premium: e.target.checked }))}
                              />
                              👑
                            </label>
                            <label className="text-xs text-white/70 flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={!!editDraft.is_visible}
                                onChange={(e) => setEditDraft((d) => ({ ...d, is_visible: e.target.checked }))}
                              />
                              👁️
                            </label>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1.5">
                            <button
                              onClick={saveEdit}
                              disabled={busyId === it.id}
                              className="px-2 py-1 rounded text-xs text-green-300 border border-green-500/30 hover:border-green-500/60"
                            >
                              💾
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-2 py-1 rounded text-xs text-white/60 border border-white/10 hover:border-white/30"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={it.id} style={{ background: it.is_visible ? "hsl(220 20% 11%)" : "hsl(220 20% 8%)", opacity: it.is_visible ? 1 : 0.55 }}>
                      <td className="px-3 py-2 text-center text-2xl">{it.icon || "✨"}</td>
                      <td className="px-3 py-2">
                        <span className="text-white/90 text-sm">{it.name}</span>
                        {it.is_premium && <span className="block text-[10px] text-yellow-400 mt-0.5">👑 بريميوم</span>}
                      </td>
                      <td className="px-3 py-2 text-white/60 text-xs whitespace-nowrap">{TYPE_LABEL[it.type] ?? it.type}</td>
                      <td className="px-3 py-2 text-amber-300 text-sm font-bold whitespace-nowrap">{it.price.toLocaleString()} 🪙</td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <code className="text-[10px] text-white/40 font-mono break-all line-clamp-2 block max-w-[220px]" dir="ltr">
                          {it.css_effect || "—"}
                        </code>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggleVisible(it)}
                          disabled={busyId === it.id}
                          className={`text-xs px-2 py-1 rounded ${it.is_visible ? "bg-green-900/40 text-green-300" : "bg-white/5 text-white/40"}`}
                          title="تبديل الظهور"
                        >
                          {it.is_visible ? "👁️ ظاهر" : "🚫 مخفي"}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => startEdit(it)}
                            className="px-2 py-1 rounded text-xs text-white/70 border border-white/10 hover:border-white/30"
                            title="تعديل"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteItem(it)}
                            disabled={busyId === it.id}
                            className="px-2 py-1 rounded text-xs text-red-400 border border-red-500/15 hover:border-red-500/40"
                            title="حذف"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <details className="text-xs text-white/40">
          <summary className="cursor-pointer hover:text-white/70">📜 سكريبت SQL لإنشاء جدول store_items</summary>
          <pre dir="ltr" className="mt-2 p-3 rounded-lg bg-black/40 overflow-x-auto text-[11px] text-white/60 font-mono whitespace-pre">{`create table if not exists public.store_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('frame','title','powercard')),
  price       integer not null default 0,
  css_effect  text,
  icon        text,
  is_premium  boolean not null default false,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.store_items enable row level security;
create policy "store_items read for all"
  on public.store_items for select using (true);
-- Writes are intended to be performed by admins via service role.`}</pre>
        </details>
      </div>
    </div>
  );
}

// ─── Admins Manager Section ───────────────────────────────────────────────────
function AdminsManager() {
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [loadingA, setLoadingA] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { fetchAdmins(); }, []);

  async function fetchAdmins() {
    setLoadingA(true);
    const { data } = await supabase.from("admins").select("*").order("created_at");
    setAdmins(data ?? []);
    setLoadingA(false);
  }

  async function addAdmin() {
    setErr("");
    const email = newEmail.trim().toLowerCase();
    const name = newName.trim();
    if (!email || !name) { setErr("أدخل الإيميل والاسم"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr("إيميل غير صحيح"); return; }
    setSaving(true);
    const { error } = await supabase.from("admins").insert({ email, name, is_super: false });
    if (error) { setErr(error.message.includes("unique") ? "هذا الإيميل مضاف مسبقاً" : error.message); setSaving(false); return; }
    setNewEmail(""); setNewName("");
    await fetchAdmins();
    setSaving(false);
  }

  async function removeAdmin(id: string, email: string) {
    if (email === SUPER_ADMIN) return;
    if (!confirm(`هل أنت متأكد من إزالة ${email}؟`)) return;
    await supabase.from("admins").delete().eq("id", id);
    await fetchAdmins();
  }

  return (
    <div className="rounded-2xl border border-purple-500/30 overflow-hidden" style={{ background: "hsl(270 30% 10%)" }}>
      <div className="px-5 py-4 border-b border-purple-500/20 flex items-center gap-3" style={{ background: "hsl(270 30% 12%)" }}>
        <span className="text-xl">👑</span>
        <h2 className="text-white font-bold">إدارة المشرفين</h2>
        <span className="mr-auto text-xs px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-300">{admins.length} مشرف</span>
      </div>

      <div className="p-5 space-y-5">
        {/* Add new admin */}
        <div>
          <p className="text-xs text-white/50 mb-3">إضافة مشرف جديد</p>
          <div className="flex gap-2 flex-wrap">
            <input
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="البريد الإلكتروني"
              dir="ltr"
              className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl text-sm text-white border border-white/10"
              style={{ background: "hsl(220 20% 14%)" }}
            />
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="الاسم"
              className="w-36 px-4 py-2.5 rounded-xl text-sm text-white border border-white/10"
              style={{ background: "hsl(220 20% 14%)" }}
            />
            <button
              onClick={addAdmin}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
              style={{ background: "hsl(270 60% 45%)" }}
            >
              {saving ? "..." : "➕ إضافة"}
            </button>
          </div>
          {err && <p className="text-red-400 text-xs mt-2">{err}</p>}
        </div>

        {/* Admin list */}
        <div className="space-y-2">
          {loadingA ? (
            <p className="text-white/30 text-sm text-center py-4">جاري التحميل...</p>
          ) : admins.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-4">لا يوجد مشرفون</p>
          ) : admins.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/5" style={{ background: "hsl(220 20% 14%)" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: a.is_super ? "linear-gradient(135deg,#d97706,#f59e0b)" : "hsl(270 60% 30%)" }}>
                {a.is_super ? "👑" : "🛡️"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium leading-none">{a.name}</p>
                <p className="text-white/40 text-xs mt-0.5 font-mono truncate" dir="ltr">{a.email}</p>
              </div>
              {a.is_super && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 flex-shrink-0">سوبر أدمن</span>
              )}
              {!a.is_super && (
                <button
                  onClick={() => removeAdmin(a.id, a.email)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 border border-red-500/20 hover:border-red-500/50 flex-shrink-0 transition-colors"
                  title="إزالة"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Admin Page ─────────────────────────────────────────────────────────
export default function Admin() {
  const { session, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const [questions, setQuestions] = useState<EditableQ[]>([]);
  const [filterCat, setFilterCat] = useState("all");
  const [filterDiff, setFilterDiff] = useState("all");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  // Modal state: null = closed, "add" = new question, EditableQ = editing existing
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [modalInitial, setModalInitial] = useState<Partial<EditableQ>>({});

  // Top-level tab
  const [activeTab, setActiveTab] = useState<"questions" | "store">("questions");

  const userEmail = session?.user?.email ?? "";

  useEffect(() => {
    if (isLoading) return;
    if (!userEmail) { navigate("/"); return; }
    checkAdminAccess(userEmail);
  }, [isLoading, userEmail]);

  async function checkAdminAccess(email: string) {
    if (email === SUPER_ADMIN) {
      setIsAdmin(true);
      setIsSuperAdmin(true);
      setAdminChecked(true);
      loadQuestions();
      return;
    }
    const { data } = await supabase.from("admins").select("id").eq("email", email).maybeSingle();
    if (!data) { navigate("/"); return; }
    setIsAdmin(true);
    setIsSuperAdmin(false);
    setAdminChecked(true);
    loadQuestions();
  }

  async function loadQuestions() {
    setLoading(true);
    setStatus("جاري تحميل الأسئلة...");
    const { data, error } = await supabase.from("questions").select("*").order("id");
    setLoading(false);
    if (error) {
      setStatus(`❌ خطأ في الاتصال بقاعدة البيانات: ${error.message}`);
      return;
    }
    const qs = (data ?? []).map((q: any) => ({
      ...q,
      options: Array.isArray(q.options) ? q.options : JSON.parse(q.options),
    }));
    setQuestions(qs);
    setStatus(`✅ تم تحميل ${qs.length} سؤال من Supabase`);
  }

  function openEdit(q: EditableQ) {
    setModalInitial({ ...q });
    setModalMode("edit");
  }

  function openAdd() {
    setModalInitial({
      category: "islamic",
      difficulty: "easy",
      options: ["", "", "", ""],
      correct: 0,
      question: "",
    });
    setModalMode("add");
  }

  function closeModal() {
    setModalMode(null);
    setModalInitial({});
  }

  async function handleSave(q: EditableQ) {
    setSaving(true);

    if (modalMode === "add") {
      const maxId = Math.max(...questions.map((x) => x.id), 750);
      q = { ...q, id: maxId + 1 };
    }

    const payload: Record<string, unknown> = {
      id: q.id,
      question: q.question,
      options: q.options,
      correct: q.correct,
      category: q.category,
      difficulty: q.difficulty,
      image_url: q.image_url ?? null,
    };

    const { error } = await supabase
      .from("questions")
      .upsert(payload, { onConflict: "id" });
    if (error) {
      setStatus(`❌ خطأ في الحفظ: ${error.message}`);
      setSaving(false);
      return;
    }

    if (modalMode === "edit") {
      setQuestions((prev) => prev.map((x) => (x.id === q.id ? q : x)));
      setStatus(`✅ تم تحديث السؤال #${q.id}`);
    } else {
      setQuestions((prev) => [...prev, q]);
      setStatus(`✅ تمت إضافة السؤال #${q.id}`);
    }

    closeModal();
    setSaving(false);
  }

  async function deleteQuestion(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!confirm("هل أنت متأكد من حذف هذا السؤال؟")) return;
    setSaving(true);
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) {
      setStatus(`❌ خطأ في الحذف: ${error.message}`);
      setSaving(false);
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setStatus(`✅ تم حذف السؤال #${id}`);
    setSaving(false);
  }

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (filterCat !== "all" && q.category !== filterCat) return false;
      if (filterDiff !== "all" && q.difficulty !== filterDiff) return false;
      if (
        search &&
        !q.question.includes(search) &&
        !q.options.some((o) => o.includes(search))
      )
        return false;
      return true;
    });
  }, [questions, filterCat, filterDiff, search]);

  if (isLoading || !adminChecked)
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "hsl(220 20% 8%)" }}
      >
        <div className="text-white">جاري التحقق من الصلاحيات...</div>
      </div>
    );

  if (!isAdmin) return null;

  return (
    <div
      className="min-h-screen text-right"
      style={{ background: "hsl(220 20% 8%)", direction: "rtl" }}
    >
      {/* ── Modal ── */}
      {modalMode && (
        <QuestionModal
          initial={modalInitial}
          mode={modalMode}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
        />
      )}

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-20 border-b border-white/10"
        style={{ background: "hsl(220 20% 10%)" }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚙️</span>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">لوحة الإدارة</h1>
              <p className="text-xs" style={{ color: "hsl(45 85% 50%)" }}>
                ميدان — إدارة الأسئلة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isSuperAdmin && (
              <span className="text-xs px-2 py-1 rounded-full bg-yellow-900/50 text-yellow-300">👑 سوبر أدمن</span>
            )}
            <span className="text-xs px-2 py-1 rounded-full bg-green-900/50 text-green-300">
              {userEmail}
            </span>
            <button
              onClick={() => navigate("/")}
              className="text-xs px-3 py-1.5 rounded-xl border border-white/20 text-white/70 hover:border-white/40"
            >
              ← العودة للتطبيق
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Top-level tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-1">
          {([
            { id: "questions", label: "📚 الأسئلة" },
            { id: "store",     label: "🛍️ المتجر" },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-t-xl text-sm font-bold transition-colors ${
                activeTab === t.id
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 border-b-transparent"
                  : "text-white/50 hover:text-white border border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "store" ? (
          <>
            <StoreManager />
            <div className="h-10" />
          </>
        ) : (
          <QuestionsTab
            status={status} loading={loading} saving={saving}
            questions={questions} filtered={filtered}
            search={search} setSearch={setSearch}
            filterCat={filterCat} setFilterCat={setFilterCat}
            filterDiff={filterDiff} setFilterDiff={setFilterDiff}
            loadQuestions={loadQuestions}
            openAdd={openAdd} openEdit={openEdit} deleteQuestion={deleteQuestion}
            isSuperAdmin={isSuperAdmin}
          />
        )}
      </div>
    </div>
  );
}

// ─── Questions Tab (extracted from main Admin component body) ────────────────
function QuestionsTab(props: {
  status: string;
  loading: boolean;
  saving: boolean;
  questions: EditableQ[];
  filtered: EditableQ[];
  search: string; setSearch: (s: string) => void;
  filterCat: string; setFilterCat: (s: string) => void;
  filterDiff: string; setFilterDiff: (s: string) => void;
  loadQuestions: () => void;
  openAdd: () => void;
  openEdit: (q: EditableQ) => void;
  deleteQuestion: (e: React.MouseEvent, id: number) => void;
  isSuperAdmin: boolean;
}) {
  const {
    status, loading, saving, questions, filtered,
    search, setSearch, filterCat, setFilterCat, filterDiff, setFilterDiff,
    loadQuestions, openAdd, openEdit, deleteQuestion, isSuperAdmin,
  } = props;
  return (
    <div className="space-y-5">
        {/* Status */}
        {status && (
          <div
            className={`text-sm px-4 py-3 rounded-xl border ${
              status.startsWith("✅")
                ? "bg-green-900/30 border-green-500/30 text-green-300"
                : status.startsWith("❌")
                ? "bg-red-900/30 border-red-500/30 text-red-300"
                : "bg-yellow-900/30 border-yellow-500/30 text-yellow-300"
            }`}
          >
            {status}
          </div>
        )}

        {/* Stats + actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-3">
            {[
              { label: "إجمالي", value: questions.length },
              { label: "معروض", value: filtered.length },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="px-4 py-2 rounded-xl text-center"
                style={{ background: "hsl(220 20% 14%)" }}
              >
                <div
                  className="text-xl font-bold"
                  style={{ color: "hsl(45 85% 50%)" }}
                >
                  {value}
                </div>
                <div className="text-xs text-white/50">{label}</div>
              </div>
            ))}
            <div className="px-4 py-2 rounded-xl text-center bg-green-900/20">
              <div className="text-xl">{loading ? "⏳" : "✅"}</div>
              <div className="text-xs text-green-400">
                {loading ? "تحميل" : "Supabase"}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mr-auto flex-wrap">
            <button
              onClick={loadQuestions}
              disabled={loading || saving}
              className="px-4 py-2 rounded-xl text-sm border border-white/20 text-white/70 hover:border-white/40 disabled:opacity-50"
            >
              🔄 تحديث
            </button>
            <button
              onClick={openAdd}
              className="px-4 py-2 rounded-xl font-bold text-sm text-white"
              style={{ background: "hsl(270 60% 45%)" }}
            >
              ➕ إضافة سؤال
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 بحث في الأسئلة والإجابات..."
            className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl text-sm text-white border border-white/10"
            style={{ background: "hsl(220 20% 14%)" }}
          />
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-sm text-white border border-white/10"
            style={{ background: "hsl(220 20% 14%)" }}
          >
            <option value="all">🗂️ كل الفئات</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <select
            value={filterDiff}
            onChange={(e) => setFilterDiff(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-sm text-white border border-white/10"
            style={{ background: "hsl(220 20% 14%)" }}
          >
            <option value="all">📊 كل المستويات</option>
            <option value="easy">🟢 سهل</option>
            <option value="medium">🟡 متوسط</option>
            <option value="hard">🔴 صعب</option>
          </select>
        </div>

        {/* Hint */}
        <p className="text-xs text-white/30 pr-1">
          💡 اضغط على أي صف أو على ✏️ لفتح نافذة التعديل
        </p>

        {/* Table */}
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "650px" }}>
              <thead>
                <tr style={{ background: "hsl(220 20% 14%)" }}>
                  <th className="px-4 py-3 text-right text-white/40 font-medium w-10">#</th>
                  <th className="px-4 py-3 text-right text-white/40 font-medium">السؤال</th>
                  <th className="px-4 py-3 text-right text-white/40 font-medium">الصحيحة</th>
                  <th className="px-4 py-3 text-right text-white/40 font-medium hidden md:table-cell">
                    الخاطئات
                  </th>
                  <th className="px-4 py-3 text-right text-white/40 font-medium hidden sm:table-cell">
                    الفئة
                  </th>
                  <th className="px-4 py-3 text-right text-white/40 font-medium">مستوى</th>
                  <th className="px-4 py-3 text-right text-white/40 font-medium w-20">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-white/30 text-sm"
                    >
                      لا توجد أسئلة تطابق البحث
                    </td>
                  </tr>
                )}
                {filtered.map((q) => {
                  const cat = CATEGORIES.find((c) => c.id === q.category);
                  const wrong = q.options.filter((_, i) => i !== q.correct);
                  return (
                    <tr
                      key={q.id}
                      onClick={() => openEdit(q)}
                      className="cursor-pointer transition-colors group"
                      style={{ background: "hsl(220 20% 11%)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "hsl(220 20% 15%)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "hsl(220 20% 11%)")
                      }
                    >
                      {/* ID */}
                      <td className="px-4 py-3 text-white/25 font-mono text-xs">
                        {q.id}
                      </td>

                      {/* Question */}
                      <td className="px-4 py-3 max-w-[260px]">
                        <span className="text-white/85 leading-relaxed line-clamp-2 text-xs">
                          {q.question}
                        </span>
                      </td>

                      {/* Correct */}
                      <td className="px-4 py-3 max-w-[120px]">
                        <span className="text-green-300 text-xs font-medium line-clamp-1">
                          {q.options[q.correct]}
                        </span>
                      </td>

                      {/* Wrong answers */}
                      <td className="px-4 py-3 hidden md:table-cell max-w-[150px]">
                        <div className="space-y-0.5">
                          {wrong.map((w, i) => (
                            <div
                              key={i}
                              className="text-xs text-white/40 line-clamp-1"
                            >
                              {w}
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-white/50 text-xs whitespace-nowrap">
                          {cat?.icon} {cat?.name}
                        </span>
                      </td>

                      {/* Difficulty */}
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${badge(
                            q.difficulty
                          )}`}
                        >
                          {diffLabel(q.difficulty)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openEdit(q)}
                            className="px-2.5 py-1.5 rounded-lg text-xs text-white/70 border border-white/10 hover:border-white/30 hover:text-white transition-colors"
                            title="تعديل"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => deleteQuestion(e, q.id)}
                            className="px-2.5 py-1.5 rounded-lg text-xs text-red-400 border border-red-500/15 hover:border-red-500/40 transition-colors"
                            title="حذف"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Admins Manager (super admin only) ── */}
        {isSuperAdmin && <AdminsManager />}

        <div className="h-10" />
    </div>
  );
}
