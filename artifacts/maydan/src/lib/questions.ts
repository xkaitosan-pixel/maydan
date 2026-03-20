export interface Question {
  id: number;
  question: string;
  options: string[];
  correct: number;
  category: string;
}

export const questions: Question[] = [
  {
    id: 1,
    question: "ما هي عاصمة المملكة العربية السعودية؟",
    options: ["جدة", "الرياض", "مكة المكرمة", "الدمام"],
    correct: 1,
    category: "جغرافيا"
  },
  {
    id: 2,
    question: "ما هو أطول نهر في العالم؟",
    options: ["نهر الأمازون", "نهر النيل", "نهر الكونغو", "نهر المسيسيبي"],
    correct: 1,
    category: "جغرافيا"
  },
  {
    id: 3,
    question: "كم عدد كواكب المجموعة الشمسية؟",
    options: ["7", "8", "9", "10"],
    correct: 1,
    category: "علوم"
  },
  {
    id: 4,
    question: "من هو مؤلف رواية 'ألف شمس مشرقة'؟",
    options: ["نجيب محفوظ", "خالد حسيني", "إبراهيم الكوني", "طه حسين"],
    correct: 1,
    category: "أدب"
  },
  {
    id: 5,
    question: "ما هو العنصر الأكثر وفرة في الغلاف الجوي للأرض؟",
    options: ["الأكسجين", "النيتروجين", "ثاني أكسيد الكربون", "الأرجون"],
    correct: 1,
    category: "علوم"
  },
  {
    id: 6,
    question: "في أي سنة اكتشف كريستوف كولومبوس أمريكا؟",
    options: ["1488", "1492", "1500", "1510"],
    correct: 1,
    category: "تاريخ"
  },
  {
    id: 7,
    question: "ما هي أكبر قارة في العالم؟",
    options: ["أفريقيا", "آسيا", "أمريكا الشمالية", "أوروبا"],
    correct: 1,
    category: "جغرافيا"
  },
  {
    id: 8,
    question: "من اخترع الهاتف؟",
    options: ["توماس إديسون", "ألكسندر غراهام بيل", "نيكولا تسلا", "مارسيلو ماركوني"],
    correct: 1,
    category: "علوم"
  },
  {
    id: 9,
    question: "ما هو الرمز الكيميائي للذهب؟",
    options: ["Go", "Au", "Ag", "Gd"],
    correct: 1,
    category: "علوم"
  },
  {
    id: 10,
    question: "ما عدد لاعبي كرة القدم في كل فريق؟",
    options: ["10", "11", "12", "9"],
    correct: 1,
    category: "رياضة"
  },
  {
    id: 11,
    question: "ما هي عاصمة فرنسا؟",
    options: ["مرسيليا", "باريس", "ليون", "نيس"],
    correct: 1,
    category: "جغرافيا"
  },
  {
    id: 12,
    question: "كم عدد أيام السنة الكبيسة؟",
    options: ["365", "366", "367", "364"],
    correct: 1,
    category: "معلومات عامة"
  },
  {
    id: 13,
    question: "ما هي أكبر محيطات العالم؟",
    options: ["المحيط الأطلسي", "المحيط الهادئ", "المحيط الهندي", "المحيط المتجمد الشمالي"],
    correct: 1,
    category: "جغرافيا"
  },
  {
    id: 14,
    question: "من كتب 'المقدمة' الشهيرة في علم التاريخ؟",
    options: ["ابن رشد", "ابن خلدون", "ابن سينا", "الغزالي"],
    correct: 1,
    category: "تاريخ"
  },
  {
    id: 15,
    question: "ما هو أسرع حيوان بري في العالم؟",
    options: ["الأسد", "الفهد", "الغزال", "الحصان"],
    correct: 1,
    category: "طبيعة"
  },
  {
    id: 16,
    question: "في أي دولة يقع برج إيفل؟",
    options: ["إيطاليا", "فرنسا", "إسبانيا", "بلجيكا"],
    correct: 1,
    category: "جغرافيا"
  },
  {
    id: 17,
    question: "ما هي عملة اليابان؟",
    options: ["اليوان", "الين", "الوون", "الدونغ"],
    correct: 1,
    category: "معلومات عامة"
  },
  {
    id: 18,
    question: "كم تبلغ سرعة الضوء تقريباً في الفراغ؟",
    options: ["200,000 كم/ث", "300,000 كم/ث", "400,000 كم/ث", "150,000 كم/ث"],
    correct: 1,
    category: "علوم"
  },
  {
    id: 19,
    question: "ما هو الكوكب الأقرب إلى الشمس؟",
    options: ["الزهرة", "عطارد", "المريخ", "الأرض"],
    correct: 1,
    category: "علوم"
  },
  {
    id: 20,
    question: "ما هي أصغر دولة في العالم من حيث المساحة؟",
    options: ["موناكو", "الفاتيكان", "سان مارينو", "ليشتنشتاين"],
    correct: 1,
    category: "جغرافيا"
  }
];

export function getRandomQuestions(count: number = 10): Question[] {
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
