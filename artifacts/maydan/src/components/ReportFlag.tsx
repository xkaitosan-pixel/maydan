import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ReportType =
  | "wrong_question"
  | "wrong_answer"
  | "bad_options"
  | "bad_wording"
  | "other";

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: "wrong_question", label: "السؤال خاطئ" },
  { value: "wrong_answer", label: "الإجابة الصحيحة خاطئة" },
  { value: "bad_options", label: "خيارات غير مناسبة" },
  { value: "bad_wording", label: "مشكلة في الصياغة" },
  { value: "other", label: "أخرى" },
];

export interface ReportFlagProps {
  questionId: string | number;
  questionText: string;
  reporter?: string | null;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

export default function ReportFlag({
  questionId,
  questionText,
  reporter,
  className,
  onOpenChange,
}: ReportFlagProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => { onOpenChange?.(open); }, [open]);
  const [type, setType] = useState<ReportType>("wrong_question");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  function close() {
    setOpen(false);
    setTimeout(() => {
      setType("wrong_question");
      setComment("");
      setDone(false);
      setErr("");
      setSending(false);
    }, 200);
  }

  async function submit() {
    setSending(true);
    setErr("");
    const { error } = await supabase.from("question_reports").insert({
      question_id: String(questionId),
      question_text: questionText,
      report_type: type,
      comment: comment.trim() || null,
      reported_by: reporter && reporter.trim() ? reporter.trim() : null,
      status: "pending",
    });
    setSending(false);
    if (error) {
      setErr(error.message || "تعذر إرسال البلاغ");
      return;
    }
    setDone(true);
    setTimeout(close, 1500);
  }

  return (
    <>
      <button
        type="button"
        aria-label="الإبلاغ عن مشكلة"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          className ??
          "absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center text-sm bg-black/30 hover:bg-black/50 text-white/70 hover:text-white border border-white/10 z-10 transition-colors"
        }
        title="الإبلاغ عن مشكلة"
      >
        🚩
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={close}
          dir="rtl"
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl"
            style={{ background: "hsl(220 20% 12%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <span className="text-lg">🚩</span>
              <h3 className="text-white font-bold text-sm">الإبلاغ عن مشكلة</h3>
              <button
                onClick={close}
                className="mr-auto text-white/50 hover:text-white text-sm px-2"
              >
                ✕
              </button>
            </div>

            {done ? (
              <div className="p-6 text-center">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-green-400 font-bold">شكراً! تم إرسال البلاغ</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <p className="text-xs text-white/60">اختر نوع المشكلة:</p>
                <div className="space-y-1.5">
                  {REPORT_TYPES.map((t) => (
                    <label
                      key={t.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm border transition-colors ${
                        type === t.value
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                          : "border-white/10 text-white/80 hover:border-white/25"
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-type"
                        value={t.value}
                        checked={type === t.value}
                        onChange={() => setType(t.value)}
                        className="accent-amber-400"
                      />
                      <span>{t.label}</span>
                    </label>
                  ))}
                </div>

                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 400))}
                  placeholder="تعليق اختياري..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10 resize-none"
                  style={{ background: "hsl(220 20% 16%)" }}
                />

                {err && <p className="text-red-400 text-xs">⚠️ {err}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={close}
                    disabled={sending}
                    className="flex-1 px-3 py-2 rounded-xl text-sm border border-white/15 text-white/70 hover:border-white/30 disabled:opacity-40"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={submit}
                    disabled={sending}
                    className="flex-1 px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg,#dc2626,#f59e0b)" }}
                  >
                    {sending ? "جاري الإرسال..." : "إرسال البلاغ"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
