import { useLocation } from "wouter";
import { ArrowRight } from "lucide-react";

export default function Terms() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen gradient-hero" dir="rtl">
      <div className="rp-narrow">
        <header className="p-4 flex items-center gap-3 border-b border-border/30 sticky top-0 bg-background/95 backdrop-blur z-10">
          <button
            onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}
            className="text-muted-foreground hover:text-foreground"
            aria-label="رجوع"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">شروط الاستخدام 📜</h1>
        </header>

        <article className="p-5 space-y-5 pb-24 text-sm leading-7 text-foreground">
          <p className="text-muted-foreground text-xs">
            آخر تحديث: مايو ٢٠٢٦
          </p>

          <p>
            مرحباً بك في <strong className="text-primary">ميدان</strong> — منصة تحديات المعرفة العربية.
            باستخدامك للتطبيق فإنك توافق على هذه الشروط. إذا لم تكن موافقاً، يرجى عدم استخدام التطبيق.
          </p>

          <Section title="١. حسابك وبياناتك">
            <ul className="list-disc pr-5 space-y-1.5">
              <li>تستطيع اللعب كضيف بدون حساب، أو إنشاء حساب باستخدام بريدك الإلكتروني أو حساب Google.</li>
              <li>أنت مسؤول عن سرية بريدك وكلمة المرور.</li>
              <li>اسمك المستعار يظهر في لوحات المتصدرين، اختر اسماً مناسباً.</li>
              <li>يمكنك حذف حسابك في أي وقت من صفحة الإعدادات.</li>
            </ul>
          </Section>

          <Section title="٢. كيف نستخدم بياناتك">
            <ul className="list-disc pr-5 space-y-1.5">
              <li>نحفظ نتائجك وإحصائياتك لعرضها في ملفك الشخصي ولوحات المتصدرين.</li>
              <li>لا نبيع بياناتك ولا نشاركها مع أي طرف ثالث لأغراض إعلانية.</li>
              <li>لمعرفة التفاصيل، راجع <button onClick={() => navigate("/privacy")} className="text-primary underline">سياسة الخصوصية</button>.</li>
            </ul>
          </Section>

          <Section title="٣. السلوك المقبول">
            <p>عند استخدامك ميدان، تتعهد بأن لا تقوم بـ:</p>
            <ul className="list-disc pr-5 space-y-1.5">
              <li>استخدام أسماء مسيئة أو عنصرية أو تنتهك الأخلاق العامة.</li>
              <li>محاولة الغش، أو تشغيل برامج تلقائية، أو استغلال الأخطاء التقنية.</li>
              <li>انتحال شخصية لاعبين آخرين أو إدارة التطبيق.</li>
              <li>إساءة استخدام نظام التحديات لمضايقة الآخرين.</li>
              <li>محاولة الوصول لحسابات لاعبين آخرين أو لقواعد بياناتنا بشكل غير مصرّح به.</li>
            </ul>
            <p className="text-muted-foreground text-xs">
              نحتفظ بالحق في إيقاف أو حذف أي حساب يخالف هذه الشروط دون إنذار مسبق.
            </p>
          </Section>

          <Section title="٤. الملكية الفكرية">
            <p>
              جميع الأسئلة، التصاميم، الشعارات، والنصوص داخل ميدان مملوكة لنا أو مرخّصة لنا.
              لا يحق لك نسخها أو إعادة استخدامها تجارياً دون إذن خطّي مسبق.
            </p>
          </Section>

          <Section title="٥. حدود المسؤولية">
            <p>
              نقدّم ميدان «كما هو» دون أي ضمانات. لا نتحمل المسؤولية عن أي خسارة بيانات
              أو انقطاع خدمة قد يحدث نتيجة ظروف خارجة عن إرادتنا.
            </p>
          </Section>

          <Section title="٦. تعديل الشروط">
            <p>
              قد نحدّث هذه الشروط من وقت لآخر. سننشر النسخة الجديدة على هذه الصفحة،
              والاستمرار في استخدام التطبيق بعد التعديل يعني موافقتك على الشروط الجديدة.
            </p>
          </Section>

          <Section title="٧. التواصل">
            <p>
              لأي استفسار حول هذه الشروط، تواصل معنا على:
              <a href="mailto:support@maydanapp.com" className="text-primary mx-1 underline">support@maydanapp.com</a>
            </p>
          </Section>

          <p className="text-center text-xs text-muted-foreground pt-4">
            شكراً لاستخدامك ميدان 🏆
          </p>
        </article>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-bold text-base text-primary">{title}</h2>
      <div className="text-foreground/90 space-y-2">{children}</div>
    </section>
  );
}
