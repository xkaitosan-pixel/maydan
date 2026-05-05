import { useLocation } from "wouter";
import { ArrowRight } from "lucide-react";

export default function Privacy() {
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
          <h1 className="text-lg font-bold">سياسة الخصوصية 🔒</h1>
        </header>

        <article className="p-5 space-y-5 pb-24 text-sm leading-7 text-foreground">
          <p className="text-muted-foreground text-xs">
            آخر تحديث: مايو ٢٠٢٦
          </p>

          <p>
            خصوصيتك مهمة لنا. تشرح هذه السياسة ما الذي نجمعه، ولماذا، وحقوقك تجاهه.
          </p>

          <Section title="١. ما الذي نجمعه">
            <ul className="list-disc pr-5 space-y-1.5">
              <li><strong>معلومات الحساب:</strong> اسم المستخدم، البريد الإلكتروني، الصورة الرمزية، البلد (اختياري).</li>
              <li><strong>بيانات اللعب:</strong> النتائج، الإنجازات، السلسلة (Streak)، الفئات المفضّلة.</li>
              <li><strong>التحديات:</strong> الأسئلة وإجابات المنشئ والمنافس لكل تحدي.</li>
              <li><strong>بيانات تقنية:</strong> سجلات الأخطاء العامة (بدون معلومات شخصية) لتحسين التطبيق.</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              لا نجمع: موقعك الجغرافي الدقيق، جهات اتصالك، صور أو ملفات من جهازك.
            </p>
          </Section>

          <Section title="٢. لماذا نستخدم هذه البيانات">
            <ul className="list-disc pr-5 space-y-1.5">
              <li>عرض نتائجك وملفك في لوحات المتصدرين.</li>
              <li>السماح للأصدقاء بإرسال التحديات إليك.</li>
              <li>منع الغش والإساءة في اللعبة.</li>
              <li>تحسين الأسئلة والميزات بناءً على الاستخدام العام (إحصائيات مجمّعة).</li>
            </ul>
          </Section>

          <Section title="٣. مع من نشاركها">
            <p>
              نستخدم خدمات موثوقة لتشغيل التطبيق:
            </p>
            <ul className="list-disc pr-5 space-y-1.5">
              <li><strong>Supabase:</strong> لتخزين الحسابات والنتائج (مزوّد قاعدة البيانات).</li>
              <li><strong>Google / Apple:</strong> فقط إذا اخترت تسجيل الدخول من خلالهما.</li>
              <li><strong>DiceBear:</strong> لتوليد الصور الرمزية الافتراضية.</li>
            </ul>
            <p className="font-bold">
              نحن <span className="text-primary">لا نبيع</span> بياناتك ولا نستخدمها للإعلانات الموجّهة.
            </p>
          </Section>

          <Section title="٤. ما الذي يُحفظ على جهازك">
            <p>
              نستخدم تخزين المتصفح (localStorage) لحفظ:
            </p>
            <ul className="list-disc pr-5 space-y-1.5">
              <li>إعدادات الصوت والإشعارات والاهتزاز.</li>
              <li>اسمك المستعار للعب كضيف.</li>
              <li>التقدم في الجلسة الحالية.</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              لا نخزّن كلمات المرور أو رموز الجلسة بشكل واضح — تتولّى Supabase ذلك بشكل آمن.
            </p>
          </Section>

          <Section title="٥. حقوقك">
            <ul className="list-disc pr-5 space-y-1.5">
              <li><strong>الاطّلاع:</strong> يمكنك رؤية كل بياناتك من ملفك الشخصي.</li>
              <li><strong>التعديل:</strong> اسم المستخدم، الصورة، البلد، النبذة، الفئات المفضّلة.</li>
              <li><strong>الحذف:</strong> «حذف الحساب» في الإعدادات يمسح بياناتك نهائياً.</li>
              <li><strong>الاستفسار:</strong> راسلنا على <a href="mailto:support@maydanapp.com" className="text-primary underline">support@maydanapp.com</a>.</li>
            </ul>
          </Section>

          <Section title="٦. الأطفال">
            <p>
              ميدان مناسب لجميع الأعمار، لكنّنا لا نطلب من الأطفال دون ١٣ عاماً إنشاء حساب
              بأنفسهم. على ولي الأمر مرافقة أطفاله أثناء التسجيل.
            </p>
          </Section>

          <Section title="٧. تحديثات هذه السياسة">
            <p>
              قد نُجري تعديلات على هذه السياسة. سننشر التعديلات هنا مع تحديث تاريخ
              «آخر تحديث» في الأعلى.
            </p>
          </Section>

          <p className="text-center text-xs text-muted-foreground pt-4">
            شكراً لثقتك ❤️
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
