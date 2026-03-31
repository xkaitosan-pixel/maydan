import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { questions as staticQuestions, CATEGORIES } from "@/lib/questions";
import type { Question } from "@/lib/questions";

const ADMIN_EMAIL = "xkaito.san@gmail.com";

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
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  // Modal state: null = closed, "add" = new question, EditableQ = editing existing
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [modalInitial, setModalInitial] = useState<Partial<EditableQ>>({});

  const userEmail = session?.user?.email ?? "";

  useEffect(() => {
    if (!isLoading && userEmail !== ADMIN_EMAIL) navigate("/");
  }, [isLoading, userEmail, navigate]);

  useEffect(() => {
    if (userEmail === ADMIN_EMAIL) loadQuestions();
  }, [userEmail]);

  async function loadQuestions() {
    setStatus("جاري تحميل الأسئلة...");
    const { data, error } = await supabase.from("questions").select("*").order("id");
    if (error || !data || data.length === 0) {
      setDbConnected(false);
      setQuestions(staticQuestions.map((q) => ({ ...q })));
      setStatus(
        error
          ? "⚠️ جدول قاعدة البيانات غير موجود — الأسئلة من الملف المحلي. اضغط 'تهيئة قاعدة البيانات'."
          : "⚠️ قاعدة البيانات فارغة. اضغط 'تهيئة قاعدة البيانات' أولاً."
      );
    } else {
      setDbConnected(true);
      setQuestions(
        data.map((q: any) => ({
          ...q,
          options: Array.isArray(q.options) ? q.options : JSON.parse(q.options),
        }))
      );
      setStatus(`✅ تم تحميل ${data.length} سؤال من قاعدة البيانات`);
    }
  }

  async function seedDatabase() {
    setSaving(true);
    setStatus("جاري رفع الأسئلة إلى قاعدة البيانات...");
    const payload = staticQuestions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      correct: q.correct,
      category: q.category,
      difficulty: q.difficulty,
    }));
    const { error } = await supabase.from("questions").upsert(payload, { onConflict: "id" });
    setSaving(false);
    if (error) {
      setStatus(`❌ خطأ في الرفع: ${error.message}`);
    } else {
      setDbConnected(true);
      setStatus(`✅ تم رفع ${payload.length} سؤال إلى قاعدة البيانات`);
      await loadQuestions();
    }
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
      const maxId = Math.max(...questions.map((x) => x.id), 225);
      q = { ...q, id: maxId + 1 };
    }

    const payload = {
      id: q.id,
      question: q.question,
      options: q.options,
      correct: q.correct,
      category: q.category,
      difficulty: q.difficulty,
    };

    if (dbConnected) {
      const { error } = await supabase
        .from("questions")
        .upsert(payload, { onConflict: "id" });
      if (error) {
        setStatus(`❌ خطأ في الحفظ: ${error.message}`);
        setSaving(false);
        return;
      }
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
    if (dbConnected) {
      const { error } = await supabase.from("questions").delete().eq("id", id);
      if (error) {
        setStatus(`❌ خطأ في الحذف: ${error.message}`);
        setSaving(false);
        return;
      }
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

  if (isLoading)
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "hsl(220 20% 8%)" }}
      >
        <div className="text-white">جاري التحقق...</div>
      </div>
    );

  if (userEmail !== ADMIN_EMAIL) return null;

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
            <div
              className={`px-4 py-2 rounded-xl text-center ${
                dbConnected ? "bg-green-900/20" : "bg-yellow-900/20"
              }`}
            >
              <div className="text-xl">
                {dbConnected === null ? "⏳" : dbConnected ? "✅" : "⚠️"}
              </div>
              <div
                className={`text-xs ${
                  dbConnected ? "text-green-400" : "text-yellow-400"
                }`}
              >
                {dbConnected === null ? "يتحقق" : dbConnected ? "متصل" : "محلي"}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mr-auto flex-wrap">
            {!dbConnected && (
              <button
                onClick={seedDatabase}
                disabled={saving}
                className="px-4 py-2 rounded-xl font-bold text-sm text-black disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
              >
                {saving ? "⏳ جاري الرفع..." : "🚀 تهيئة قاعدة البيانات"}
              </button>
            )}
            <button
              onClick={loadQuestions}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm border border-white/20 text-white/70 hover:border-white/40"
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

        {/* SQL hint when DB not connected */}
        {!dbConnected && (
          <details className="rounded-xl border border-yellow-500/20 bg-yellow-900/10 p-4">
            <summary className="text-yellow-300 text-sm font-medium cursor-pointer">
              📋 كيفية إعداد جدول قاعدة البيانات في Supabase
            </summary>
            <div className="mt-3 text-xs text-white/60 space-y-2">
              <p>افتح Supabase Dashboard → SQL Editor، ثم نفّذ الكود التالي:</p>
              <pre
                className="bg-black/40 rounded-lg p-3 text-green-300 overflow-x-auto text-left"
                style={{ direction: "ltr" }}
              >
{`create table if not exists questions (
  id bigint primary key,
  question text not null,
  options jsonb not null,
  correct integer not null,
  category text not null,
  difficulty text not null,
  created_at timestamptz default now()
);
alter table questions enable row level security;
create policy "Public read" on questions
  for select using (true);
create policy "Authenticated write" on questions
  for all using (auth.role() = 'authenticated');`}
              </pre>
              <p>
                بعد تنفيذ الكود، اضغط{" "}
                <strong className="text-yellow-300">"تهيئة قاعدة البيانات"</strong> لرفع
                الأسئلة.
              </p>
            </div>
          </details>
        )}

        <div className="h-10" />
      </div>
    </div>
  );
}
