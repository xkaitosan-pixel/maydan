import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { questions as staticQuestions, CATEGORIES } from "@/lib/questions";
import type { Question } from "@/lib/questions";

const ADMIN_EMAIL = "xkaito.san@gmail.com";
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

type EditableQ = Question & { _dirty?: boolean; _new?: boolean };

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

export default function Admin() {
  const { session, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const [questions, setQuestions] = useState<EditableQ[]>([]);
  const [filterCat, setFilterCat] = useState("all");
  const [filterDiff, setFilterDiff] = useState("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditableQ | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newQ, setNewQ] = useState<Partial<EditableQ>>({
    category: "islamic",
    difficulty: "easy",
    options: ["", "", "", ""],
    correct: 0,
    question: "",
  });

  const userEmail = session?.user?.email ?? "";

  useEffect(() => {
    if (!isLoading && userEmail !== ADMIN_EMAIL) {
      navigate("/");
    }
  }, [isLoading, userEmail, navigate]);

  useEffect(() => {
    if (userEmail !== ADMIN_EMAIL) return;
    loadQuestions();
  }, [userEmail]);

  async function loadQuestions() {
    setStatus("جاري تحميل الأسئلة...");
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("id");

    if (error || !data || data.length === 0) {
      setDbConnected(false);
      setQuestions(staticQuestions.map((q) => ({ ...q })));
      setStatus(
        error
          ? "⚠️ جدول قاعدة البيانات غير موجود. يتم عرض الأسئلة من الملف المحلي. اضغط 'تهيئة قاعدة البيانات' لرفع الأسئلة."
          : "⚠️ قاعدة البيانات فارغة. اضغط 'تهيئة قاعدة البيانات' أولاً."
      );
    } else {
      setDbConnected(true);
      setQuestions(data.map((q: any) => ({ ...q, options: Array.isArray(q.options) ? q.options : JSON.parse(q.options) })));
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

    const { error } = await supabase
      .from("questions")
      .upsert(payload, { onConflict: "id" });

    setSaving(false);
    if (error) {
      setStatus(`❌ خطأ في الرفع: ${error.message}`);
    } else {
      setDbConnected(true);
      setStatus(`✅ تم رفع ${payload.length} سؤال إلى قاعدة البيانات`);
      await loadQuestions();
    }
  }

  async function saveQuestion(q: EditableQ) {
    setSaving(true);
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

    setQuestions((prev) =>
      prev.map((x) => (x.id === q.id ? { ...q, _dirty: false } : x))
    );
    setEditingId(null);
    setEditDraft(null);
    setStatus("✅ تم حفظ السؤال");
    setSaving(false);
  }

  async function deleteQuestion(id: number) {
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
    setStatus("✅ تم حذف السؤال");
    setSaving(false);
  }

  async function addQuestion() {
    if (!newQ.question?.trim()) { setStatus("❌ أدخل نص السؤال"); return; }
    if (newQ.options?.some((o) => !o.trim())) { setStatus("❌ أدخل جميع الإجابات الأربع"); return; }

    const maxId = Math.max(...questions.map((q) => q.id), 225);
    const q: EditableQ = {
      id: maxId + 1,
      question: newQ.question!,
      options: newQ.options as string[],
      correct: newQ.correct ?? 0,
      category: newQ.category ?? "general",
      difficulty: (newQ.difficulty as any) ?? "easy",
      _new: true,
    };

    setSaving(true);
    if (dbConnected) {
      const { error } = await supabase.from("questions").insert({
        id: q.id,
        question: q.question,
        options: q.options,
        correct: q.correct,
        category: q.category,
        difficulty: q.difficulty,
      });
      if (error) {
        setStatus(`❌ خطأ في الإضافة: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    setQuestions((prev) => [...prev, q]);
    setShowAdd(false);
    setNewQ({ category: "islamic", difficulty: "easy", options: ["", "", "", ""], correct: 0, question: "" });
    setStatus(`✅ تمت إضافة السؤال رقم ${q.id}`);
    setSaving(false);
  }

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (filterCat !== "all" && q.category !== filterCat) return false;
      if (filterDiff !== "all" && q.difficulty !== filterDiff) return false;
      if (search && !q.question.includes(search) && !q.options.some((o) => o.includes(search))) return false;
      return true;
    });
  }, [questions, filterCat, filterDiff, search]);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(220 20% 8%)" }}>
      <div className="text-white text-lg">جاري التحقق...</div>
    </div>
  );

  if (userEmail !== ADMIN_EMAIL) return null;

  return (
    <div className="min-h-screen text-right" style={{ background: "hsl(220 20% 8%)", direction: "rtl" }}>
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-white/10" style={{ background: "hsl(220 20% 10%)" }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚙️</span>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">لوحة الإدارة</h1>
              <p className="text-xs" style={{ color: "hsl(45 85% 50%)" }}>ميدان — إدارة الأسئلة</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-1 rounded-full bg-green-900/60 text-green-300">
              {userEmail}
            </span>
            <button
              onClick={() => navigate("/")}
              className="text-xs px-3 py-1.5 rounded-xl border border-white/20 text-white/70 hover:border-white/40"
            >
              العودة للتطبيق
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Status bar */}
        {status && (
          <div className={`text-sm px-4 py-3 rounded-xl border ${
            status.startsWith("✅") ? "bg-green-900/30 border-green-500/30 text-green-300"
            : status.startsWith("❌") ? "bg-red-900/30 border-red-500/30 text-red-300"
            : "bg-yellow-900/30 border-yellow-500/30 text-yellow-300"
          }`}>
            {status}
          </div>
        )}

        {/* Stats + Actions bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-3">
            <div className="px-4 py-2 rounded-xl text-center" style={{ background: "hsl(220 20% 14%)" }}>
              <div className="text-xl font-bold" style={{ color: "hsl(45 85% 50%)" }}>{questions.length}</div>
              <div className="text-xs text-white/50">إجمالي الأسئلة</div>
            </div>
            <div className="px-4 py-2 rounded-xl text-center" style={{ background: "hsl(220 20% 14%)" }}>
              <div className="text-xl font-bold" style={{ color: "hsl(45 85% 50%)" }}>{filtered.length}</div>
              <div className="text-xs text-white/50">المعروض</div>
            </div>
            <div className={`px-4 py-2 rounded-xl text-center ${dbConnected ? "bg-green-900/20" : "bg-red-900/20"}`}>
              <div className="text-xl">{dbConnected === null ? "⏳" : dbConnected ? "✅" : "⚠️"}</div>
              <div className={`text-xs ${dbConnected ? "text-green-400" : "text-yellow-400"}`}>
                {dbConnected === null ? "يتحقق" : dbConnected ? "متصل" : "محلي فقط"}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mr-auto">
            {!dbConnected && (
              <button
                onClick={seedDatabase}
                disabled={saving}
                className="px-4 py-2 rounded-xl font-bold text-sm text-black"
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
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 rounded-xl font-bold text-sm text-white"
              style={{ background: "hsl(270 60% 45%)" }}
            >
              ➕ إضافة سؤال
            </button>
          </div>
        </div>

        {/* Add Question Modal */}
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
            <div className="w-full max-w-lg rounded-2xl border border-white/10 p-6 space-y-4" style={{ background: "hsl(220 20% 12%)" }}>
              <h2 className="text-white font-bold text-lg">➕ إضافة سؤال جديد</h2>

              <div>
                <label className="text-xs text-white/50 mb-1 block">السؤال *</label>
                <textarea
                  value={newQ.question}
                  onChange={(e) => setNewQ((p) => ({ ...p, question: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-sm text-white border border-white/10 resize-none"
                  style={{ background: "hsl(220 20% 18%)" }}
                  rows={2}
                  placeholder="اكتب نص السؤال هنا..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i}>
                    <label className="text-xs mb-1 block" style={{ color: newQ.correct === i ? "hsl(45 85% 50%)" : "rgba(255,255,255,0.5)" }}>
                      {newQ.correct === i ? "✅ " : ""}إجابة {i + 1} {newQ.correct === i ? "(صحيحة)" : ""}
                    </label>
                    <div className="flex gap-1">
                      <input
                        value={newQ.options?.[i] ?? ""}
                        onChange={(e) => {
                          const opts = [...(newQ.options ?? ["", "", "", ""])];
                          opts[i] = e.target.value;
                          setNewQ((p) => ({ ...p, options: opts }));
                        }}
                        className="flex-1 px-3 py-2 rounded-xl text-sm text-white border border-white/10"
                        style={{ background: "hsl(220 20% 18%)", borderColor: newQ.correct === i ? "hsl(45 85% 50%)" : undefined }}
                        placeholder={`الإجابة ${i + 1}`}
                      />
                      <button
                        onClick={() => setNewQ((p) => ({ ...p, correct: i }))}
                        className={`px-2 py-1 rounded-lg text-xs ${newQ.correct === i ? "text-black font-bold" : "text-white/50 border border-white/10"}`}
                        style={newQ.correct === i ? { background: "hsl(45 85% 50%)" } : {}}
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/50 mb-1 block">الفئة</label>
                  <select
                    value={newQ.category}
                    onChange={(e) => setNewQ((p) => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-sm text-white border border-white/10"
                    style={{ background: "hsl(220 20% 18%)" }}
                  >
                    {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1 block">الصعوبة</label>
                  <select
                    value={newQ.difficulty}
                    onChange={(e) => setNewQ((p) => ({ ...p, difficulty: e.target.value as any }))}
                    className="w-full px-3 py-2 rounded-xl text-sm text-white border border-white/10"
                    style={{ background: "hsl(220 20% 18%)" }}
                  >
                    <option value="easy">سهل</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">صعب</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={addQuestion}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl font-bold text-black text-sm"
                  style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
                >
                  {saving ? "⏳ جاري الحفظ..." : "💾 حفظ السؤال"}
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-white/70 text-sm border border-white/10"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

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
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
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

        {/* Questions table */}
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "700px" }}>
              <thead>
                <tr style={{ background: "hsl(220 20% 14%)" }}>
                  <th className="px-4 py-3 text-right text-white/50 font-medium w-12">#</th>
                  <th className="px-4 py-3 text-right text-white/50 font-medium">السؤال</th>
                  <th className="px-4 py-3 text-right text-white/50 font-medium">الإجابة الصحيحة</th>
                  <th className="px-4 py-3 text-right text-white/50 font-medium">الإجابات الخاطئة</th>
                  <th className="px-4 py-3 text-right text-white/50 font-medium">الفئة</th>
                  <th className="px-4 py-3 text-right text-white/50 font-medium">الصعوبة</th>
                  <th className="px-4 py-3 text-right text-white/50 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-white/30">
                      لا توجد أسئلة تطابق البحث
                    </td>
                  </tr>
                )}
                {filtered.map((q) => {
                  const isEditing = editingId === q.id;
                  const draft = isEditing ? editDraft! : q;
                  const cat = CATEGORIES.find((c) => c.id === q.category);
                  const wrong = q.options.filter((_, i) => i !== q.correct);

                  return (
                    <tr
                      key={q.id}
                      className="transition-colors"
                      style={{ background: isEditing ? "hsl(220 20% 16%)" : "hsl(220 20% 11%)" }}
                    >
                      <td className="px-4 py-3 text-white/30 font-mono text-xs">{q.id}</td>

                      {/* Question text */}
                      <td className="px-4 py-3 max-w-[250px]">
                        {isEditing ? (
                          <textarea
                            value={draft.question}
                            onChange={(e) => setEditDraft((p) => p ? { ...p, question: e.target.value } : p)}
                            className="w-full px-2 py-1.5 rounded-lg text-white text-xs border border-white/20 resize-none"
                            style={{ background: "hsl(220 20% 20%)" }}
                            rows={3}
                          />
                        ) : (
                          <span className="text-white/90 leading-relaxed line-clamp-2">{q.question}</span>
                        )}
                      </td>

                      {/* Correct answer */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="space-y-1.5">
                            {draft.options.map((opt, i) => (
                              <div key={i} className="flex gap-1 items-center">
                                <button
                                  onClick={() => setEditDraft((p) => p ? { ...p, correct: i } : p)}
                                  className={`w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center text-xs ${draft.correct === i ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/20 text-white/30"}`}
                                >
                                  {draft.correct === i ? "✓" : i + 1}
                                </button>
                                <input
                                  value={opt}
                                  onChange={(e) => {
                                    const opts = [...draft.options];
                                    opts[i] = e.target.value;
                                    setEditDraft((p) => p ? { ...p, options: opts } : p);
                                  }}
                                  className={`flex-1 px-2 py-1 rounded-lg text-xs text-white border ${draft.correct === i ? "border-yellow-400/60" : "border-white/10"}`}
                                  style={{ background: "hsl(220 20% 22%)" }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-green-300 text-xs font-medium">{q.options[q.correct]}</span>
                        )}
                      </td>

                      {/* Wrong answers (read-only in non-edit mode) */}
                      <td className="px-4 py-3">
                        {!isEditing && (
                          <div className="space-y-1">
                            {wrong.map((w, i) => (
                              <div key={i} className="text-xs text-white/50">{w}</div>
                            ))}
                          </div>
                        )}
                        {isEditing && <span className="text-white/20 text-xs">← اضبط من اليسار</span>}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={draft.category}
                            onChange={(e) => setEditDraft((p) => p ? { ...p, category: e.target.value } : p)}
                            className="px-2 py-1 rounded-lg text-xs text-white border border-white/10 w-full"
                            style={{ background: "hsl(220 20% 20%)" }}
                          >
                            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-white/60 text-xs">{cat?.icon} {cat?.name}</span>
                        )}
                      </td>

                      {/* Difficulty */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={draft.difficulty}
                            onChange={(e) => setEditDraft((p) => p ? { ...p, difficulty: e.target.value as any } : p)}
                            className="px-2 py-1 rounded-lg text-xs text-white border border-white/10"
                            style={{ background: "hsl(220 20% 20%)" }}
                          >
                            {DIFFICULTIES.map((d) => <option key={d} value={d}>{diffLabel(d)}</option>)}
                          </select>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${badge(q.difficulty)}`}>
                            {diffLabel(q.difficulty)}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => saveQuestion(draft)}
                              disabled={saving}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-black"
                              style={{ background: "hsl(45 85% 50%)" }}
                            >
                              {saving ? "..." : "💾 حفظ"}
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditDraft(null); }}
                              className="px-2 py-1.5 rounded-lg text-xs text-white/50 border border-white/10"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => { setEditingId(q.id); setEditDraft({ ...q }); }}
                              className="px-3 py-1.5 rounded-lg text-xs text-white/80 border border-white/15 hover:border-white/30"
                            >
                              ✏️ تعديل
                            </button>
                            <button
                              onClick={() => deleteQuestion(q.id)}
                              className="px-2 py-1.5 rounded-lg text-xs text-red-400 border border-red-500/20 hover:border-red-500/40"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* SQL Setup hint */}
        {!dbConnected && (
          <details className="rounded-xl border border-yellow-500/20 bg-yellow-900/10 p-4">
            <summary className="text-yellow-300 text-sm font-medium cursor-pointer">
              📋 كيفية إعداد جدول قاعدة البيانات في Supabase
            </summary>
            <div className="mt-3 text-xs text-white/60 space-y-2">
              <p>افتح Supabase Dashboard → SQL Editor، ثم نفّذ الكود التالي:</p>
              <pre className="bg-black/40 rounded-lg p-3 text-green-300 overflow-x-auto text-left" style={{ direction: "ltr" }}>
{`create table if not exists questions (
  id bigint primary key,
  question text not null,
  options jsonb not null,
  correct integer not null,
  category text not null,
  difficulty text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table questions enable row level security;
create policy "Public read" on questions
  for select using (true);
create policy "Admin write" on questions
  for all using (auth.role() = 'authenticated');`}
              </pre>
              <p>بعد تنفيذ الكود أعلاه، اضغط على زر <strong className="text-yellow-300">"تهيئة قاعدة البيانات"</strong> لرفع الأسئلة.</p>
            </div>
          </details>
        )}

        <div className="h-10" />
      </div>
    </div>
  );
}
