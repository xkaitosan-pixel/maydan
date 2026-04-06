export interface Question {
  id: number;
  question: string;
  options: string[];
  correct: number;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  image_url?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  gradient: string;
  gradientFrom: string;
  gradientTo: string;
  isPremium?: boolean;
}

export const CATEGORIES: Category[] = [
  { id: "islamic",    name: "ثقافة إسلامية",    icon: "🕌", gradient: "from-emerald-800 to-emerald-950", gradientFrom: "#1a6b3c", gradientTo: "#0d3d22" },
  { id: "geography",  name: "جغرافيا عالمية",   icon: "🌍", gradient: "from-blue-800 to-blue-950",     gradientFrom: "#1a3a6b", gradientTo: "#0d1f3d" },
  { id: "general",    name: "معلومات عامة",      icon: "🧠", gradient: "from-purple-800 to-purple-950", gradientFrom: "#4a1a6b", gradientTo: "#2a0d3d" },
  { id: "sports",     name: "رياضة عالمية",      icon: "⚽", gradient: "from-orange-800 to-orange-950", gradientFrom: "#6b3a1a", gradientTo: "#3d1f0d" },
  { id: "movies",     name: "أفلام ومسلسلات",    icon: "🎬", gradient: "from-red-800 to-red-950",       gradientFrom: "#6b1a1a", gradientTo: "#3d0d0d" },
  { id: "gaming",     name: "ألعاب فيديو",        icon: "🎮", gradient: "from-cyan-800 to-cyan-950",     gradientFrom: "#1a5a6b", gradientTo: "#0d2d3d" },
  { id: "anime",      name: "أنمي",               icon: "🌸", gradient: "from-pink-800 to-pink-950",     gradientFrom: "#6b1a4a", gradientTo: "#3d0d2a" },
  { id: "cars",       name: "سيارات",             icon: "🚗", gradient: "from-neutral-700 to-neutral-900",gradientFrom: "#4a4a4a", gradientTo: "#1a1a1a" },
  { id: "food",       name: "طعام خليجي",         icon: "🍽️", gradient: "from-amber-800 to-amber-950",  gradientFrom: "#6b5a1a", gradientTo: "#3d320d" },
  { id: "business",   name: "أعمال وريادة",       icon: "💰", gradient: "from-yellow-800 to-yellow-950", gradientFrom: "#5a4a0d", gradientTo: "#2d250a" },
  { id: "science",    name: "علوم وتكنولوجيا",    icon: "🔬", gradient: "from-indigo-800 to-indigo-950", gradientFrom: "#1a2a6b", gradientTo: "#0d152d" },
  { id: "arabhistory",name: "تاريخ عربي",         icon: "📚", gradient: "from-stone-700 to-stone-900",   gradientFrom: "#5a3a1a", gradientTo: "#3d1f0d" },
  { id: "animals",    name: "حيوانات وطبيعة",     icon: "🐾", gradient: "from-green-800 to-green-950",   gradientFrom: "#1a5a2a", gradientTo: "#0d2d15" },
  { id: "popculture", name: "ثقافة شعبية",        icon: "🎭", gradient: "from-violet-800 to-violet-950", gradientFrom: "#5a1a6b", gradientTo: "#2d0d3d" },
  { id: "legends",    name: "تحدي الأساطير",      icon: "🏆", gradient: "from-yellow-700 to-yellow-950", gradientFrom: "#6b5000", gradientTo: "#3d2d00", isPremium: true },
];

export const questions: Question[] = [
  // ==================== ISLAMIC CULTURE (1-15) ====================
  { id: 1, question: "كم عدد سور القرآن الكريم؟", options: ["112", "114", "116", "118"], correct: 1, category: "islamic", difficulty: "easy" },
  { id: 2, question: "ما هي أطول سورة في القرآن الكريم؟", options: ["آل عمران", "البقرة", "النساء", "المائدة"], correct: 1, category: "islamic", difficulty: "easy" },
  { id: 3, question: "في أي شهر نزل القرآن الكريم؟", options: ["رجب", "رمضان", "شعبان", "محرم"], correct: 1, category: "islamic", difficulty: "easy" },
  { id: 4, question: "ما هو أقصر سورة في القرآن الكريم؟", options: ["الإخلاص", "الكوثر", "الفلق", "الناس"], correct: 1, category: "islamic", difficulty: "easy" },
  { id: 5, question: "كم عدد أركان الإسلام؟", options: ["4", "5", "6", "7"], correct: 1, category: "islamic", difficulty: "easy" },
  { id: 6, question: "ما اسم والدة النبي محمد ﷺ؟", options: ["خديجة", "آمنة", "فاطمة", "مريم"], correct: 1, category: "islamic", difficulty: "easy" },
  { id: 7, question: "في أي مدينة وُلد النبي محمد ﷺ؟", options: ["المدينة المنورة", "مكة المكرمة", "الطائف", "القدس"], correct: 1, category: "islamic", difficulty: "easy" },
  { id: 8, question: "كم عدد آيات سورة الفاتحة؟", options: ["5", "7", "9", "6"], correct: 1, category: "islamic", difficulty: "medium" },
  { id: 9, question: "ما هو أول مسجد بُني في الإسلام؟", options: ["المسجد الحرام", "مسجد قباء", "المسجد النبوي", "المسجد الأقصى"], correct: 1, category: "islamic", difficulty: "medium" },
  { id: 10, question: "كم مرة تُكرر كلمة 'الله' في القرآن الكريم تقريباً؟", options: ["1500", "2698", "3000", "4000"], correct: 1, category: "islamic", difficulty: "hard" },
  { id: 11, question: "ما هو اسم الملك الذي نزل بالوحي على النبي ﷺ؟", options: ["ميكائيل", "جبريل", "إسرافيل", "عزرائيل"], correct: 1, category: "islamic", difficulty: "easy" },
  { id: 12, question: "في أي عام هاجر النبي ﷺ إلى المدينة؟", options: ["620 م", "622 م", "624 م", "618 م"], correct: 1, category: "islamic", difficulty: "medium" },
  { id: 13, question: "ما هو المسجد الثالث الذي تُشد إليه الرحال؟", options: ["المسجد الحرام", "المسجد الأقصى", "المسجد النبوي", "مسجد قباء"], correct: 1, category: "islamic", difficulty: "medium" },
  { id: 14, question: "كم سنة استغرق نزول القرآن الكريم؟", options: ["20", "23", "25", "30"], correct: 1, category: "islamic", difficulty: "medium" },
  { id: 15, question: "ما هي السورة التي تُسمى 'قلب القرآن'؟", options: ["البقرة", "يس", "الرحمن", "الكهف"], correct: 1, category: "islamic", difficulty: "medium" },

  // ==================== WORLD GEOGRAPHY (16-30) ====================
  { id: 16, question: "ما هي أكبر دولة في العالم مساحةً؟", options: ["كندا", "روسيا", "الصين", "الولايات المتحدة"], correct: 1, category: "geography", difficulty: "easy" },
  { id: 17, question: "ما عاصمة أستراليا؟", options: ["سيدني", "كانبيرا", "ملبورن", "بريزبن"], correct: 1, category: "geography", difficulty: "medium" },
  { id: 18, question: "كم عدد القارات في العالم؟", options: ["5", "6", "7", "8"], correct: 2, category: "geography", difficulty: "easy" },
  { id: 19, question: "ما هو أطول نهر في العالم؟", options: ["الأمازون", "النيل", "المسيسيبي", "الكونغو"], correct: 1, category: "geography", difficulty: "easy" },
  { id: 20, question: "في أي دولة يقع برج بيزا المائل؟", options: ["فرنسا", "إيطاليا", "إسبانيا", "اليونان"], correct: 1, category: "geography", difficulty: "easy" },
  { id: 21, question: "ما هي أصغر دولة في العالم؟", options: ["موناكو", "الفاتيكان", "سان مارينو", "ليشتنشتاين"], correct: 1, category: "geography", difficulty: "easy" },
  { id: 22, question: "ما هي أعمق بحيرة في العالم؟", options: ["بحيرة فيكتوريا", "بحيرة بايكال", "بحيرة تيتيكاكا", "بحيرة سوبيريور"], correct: 1, category: "geography", difficulty: "medium" },
  { id: 23, question: "ما عاصمة البرازيل؟", options: ["ريو دي جانيرو", "برازيليا", "ساو باولو", "سالفادور"], correct: 1, category: "geography", difficulty: "medium" },
  { id: 24, question: "في أي قارة يقع جبل إيفرست؟", options: ["أفريقيا", "آسيا", "أمريكا الجنوبية", "أوروبا"], correct: 1, category: "geography", difficulty: "easy" },
  { id: 25, question: "ما هو أكبر صحراء في العالم؟", options: ["صحراء العرب", "الصحراء الكبرى", "صحراء القطب الجنوبي", "صحراء غوبي"], correct: 2, category: "geography", difficulty: "hard" },
  { id: 26, question: "ما عاصمة كندا؟", options: ["تورنتو", "أوتاوا", "فانكوفر", "مونتريال"], correct: 1, category: "geography", difficulty: "medium" },
  { id: 27, question: "ما هي أطول سلسلة جبال في العالم؟", options: ["جبال الهيمالايا", "جبال الأنديز", "جبال الألب", "جبال روكي"], correct: 1, category: "geography", difficulty: "medium" },
  { id: 28, question: "ما هو أكبر محيطات العالم؟", options: ["المحيط الأطلسي", "المحيط الهادئ", "المحيط الهندي", "المحيط المتجمد الشمالي"], correct: 1, category: "geography", difficulty: "easy" },
  { id: 29, question: "في أي دولة يقع نهر الأمازون؟", options: ["الأرجنتين", "البرازيل", "كولومبيا", "بيرو"], correct: 1, category: "geography", difficulty: "easy" },
  { id: 30, question: "ما هي أكثر دولة اكتظاظاً بالسكان في العالم؟", options: ["الهند", "الصين", "الولايات المتحدة", "إندونيسيا"], correct: 0, category: "geography", difficulty: "medium" },

  // ==================== GENERAL KNOWLEDGE (31-45) ====================
  { id: 31, question: "كم يساوي درجة الغليان للماء بالدرجة المئوية؟", options: ["90", "100", "110", "120"], correct: 1, category: "general", difficulty: "easy" },
  { id: 32, question: "ما هو الرمز الكيميائي للذهب؟", options: ["Go", "Au", "Ag", "Gd"], correct: 1, category: "general", difficulty: "medium" },
  { id: 33, question: "كم عدد ألوان قوس قزح؟", options: ["5", "6", "7", "8"], correct: 2, category: "general", difficulty: "easy" },
  { id: 34, question: "من اخترع الطائرة؟", options: ["توماس إديسون", "أخوان رايت", "نيكولا تسلا", "بنيامين فرانكلين"], correct: 1, category: "general", difficulty: "easy" },
  { id: 35, question: "كم سنة تساوي القرن؟", options: ["50", "100", "200", "1000"], correct: 1, category: "general", difficulty: "easy" },
  { id: 36, question: "ما هي أكبر عظمة في جسم الإنسان؟", options: ["العمود الفقري", "عظمة الفخذ", "القفص الصدري", "عظمة الذراع"], correct: 1, category: "general", difficulty: "medium" },
  { id: 37, question: "كم عدد أسنان الإنسان البالغ؟", options: ["28", "32", "36", "24"], correct: 1, category: "general", difficulty: "easy" },
  { id: 38, question: "ما هي اللغة الأكثر انتشاراً في العالم؟", options: ["العربية", "الإنجليزية", "المندرين", "الإسبانية"], correct: 2, category: "general", difficulty: "medium" },
  { id: 39, question: "كم عدد أضلاع الشكل السداسي (المسدس)؟", options: ["4", "5", "6", "8"], correct: 2, category: "general", difficulty: "easy" },
  { id: 40, question: "ما هو الجهاز الذي يضخ الدم في جسم الإنسان؟", options: ["الرئة", "القلب", "الكبد", "الكلى"], correct: 1, category: "general", difficulty: "easy" },
  { id: 41, question: "من كتب مسرحية 'روميو وجولييت'؟", options: ["شارلز ديكنز", "وليام شكسبير", "مارك توين", "أوسكار وايلد"], correct: 1, category: "general", difficulty: "easy" },
  { id: 42, question: "كم عدد الشخصيات في لعبة الشطرنج لكل لاعب؟", options: ["12", "14", "16", "18"], correct: 2, category: "general", difficulty: "medium" },
  { id: 43, question: "ما هو أسرع حيوان في العالم؟", options: ["الأسد", "الفهد", "الصقر الحر", "النمر"], correct: 2, category: "general", difficulty: "medium" },
  { id: 44, question: "كم عدد دقائق الساعة؟", options: ["30", "60", "90", "120"], correct: 1, category: "general", difficulty: "easy" },
  { id: 45, question: "ما هو البلد الذي تقع فيه أهرامات الجيزة؟", options: ["السودان", "مصر", "المغرب", "ليبيا"], correct: 1, category: "general", difficulty: "easy" },

  // ==================== SPORTS (46-60) ====================
  { id: 46, question: "كم مرة فاز المنتخب البرازيلي بكأس العالم؟", options: ["4", "5", "6", "3"], correct: 1, category: "sports", difficulty: "medium" },
  { id: 47, question: "ما هو الرياضي الأكثر فوزاً بجائزة كرة الذهب؟", options: ["رونالدو", "ميسي", "نيمار", "لوكا مودريتش"], correct: 1, category: "sports", difficulty: "medium" },
  { id: 48, question: "أين أُقيمت أولمبياد 2024؟", options: ["طوكيو", "باريس", "لوس أنجلوس", "لندن"], correct: 1, category: "sports", difficulty: "easy" },
  { id: 49, question: "كم لاعباً في فريق كرة القدم داخل الملعب؟", options: ["9", "10", "11", "12"], correct: 2, category: "sports", difficulty: "easy" },
  { id: 50, question: "ما هو الفريق الأكثر فوزاً بدوري أبطال أوروبا؟", options: ["برشلونة", "ريال مدريد", "بايرن ميونخ", "يوفنتوس"], correct: 1, category: "sports", difficulty: "medium" },
  { id: 51, question: "ما هي الرياضة التي تُلعب في ملعب مغلق بجدران وتُستخدم فيه مضارب صلبة مثقبة؟", options: ["تنس الأرض", "البادمنتون", "البادل", "السكواش"], correct: 2, category: "sports", difficulty: "medium" },
  { id: 52, question: "كم مترًا طول سباق الماراثون؟", options: ["40 كم", "42.195 كم", "45 كم", "38 كم"], correct: 1, category: "sports", difficulty: "hard" },
  { id: 53, question: "من فاز بكأس العالم 2022 في قطر؟", options: ["فرنسا", "الأرجنتين", "البرازيل", "كرواتيا"], correct: 1, category: "sports", difficulty: "easy" },
  { id: 54, question: "ما هي الدولة التي اخترعت رياضة الجودو؟", options: ["الصين", "اليابان", "كوريا", "تايلاند"], correct: 1, category: "sports", difficulty: "easy" },
  { id: 55, question: "كم عدد اللاعبين في فريق كرة السلة؟", options: ["4", "5", "6", "7"], correct: 1, category: "sports", difficulty: "easy" },
  { id: 56, question: "ما هو أعلى عدد أهداف سجله لاعب واحد في مباراة كأس عالم واحدة؟ (أوليغ سالينكو، روسيا ضد الكاميرون 1994)", options: ["3 أهداف", "4 أهداف", "5 أهداف", "6 أهداف"], correct: 2, category: "sports", difficulty: "hard" },
  { id: 57, question: "في أي مدينة أُقيمت أولمبياد 2020؟", options: ["بكين", "طوكيو", "سيول", "أوساكا"], correct: 1, category: "sports", difficulty: "easy" },
  { id: 58, question: "ما هو الرقم القياسي العالمي لسباق 100 متر؟", options: ["9.58 ث", "9.72 ث", "9.85 ث", "9.50 ث"], correct: 0, category: "sports", difficulty: "hard" },
  { id: 59, question: "ما هي الرياضة التي يلعبها محمد علي كلاي؟", options: ["المصارعة", "الملاكمة", "الجودو", "الكاراتيه"], correct: 1, category: "sports", difficulty: "easy" },
  { id: 60, question: "كم عدد الأشواط في مباراة كرة القدم الرسمية؟", options: ["1", "2", "3", "4"], correct: 1, category: "sports", difficulty: "easy" },

  // ==================== MOVIES & SERIES (61-75) ====================
  { id: 61, question: "ما هو أعلى فيلم تحقيقاً للإيرادات في التاريخ؟", options: ["تيتانيك", "أفاتار", "أفنجرز: نهاية اللعبة", "ستار وورز"], correct: 1, category: "movies", difficulty: "medium" },
  { id: 62, question: "من أخرج فيلم 'تيتانيك'؟", options: ["ستيفن سبيلبرغ", "جيمس كاميرون", "كريستوفر نولان", "مارتن سكورسيزي"], correct: 1, category: "movies", difficulty: "medium" },
  { id: 63, question: "في أي عام صدر فيلم 'حرب النجوم' الأصلي؟", options: ["1974", "1977", "1980", "1983"], correct: 1, category: "movies", difficulty: "medium" },
  { id: 64, question: "من أخرج فيلم 'الجوكر' (Joker) عام 2019؟", options: ["مارتن سكورسيزي", "تود فيليبس", "كريستوفر نولان", "ريدلي سكوت"], correct: 1, category: "movies", difficulty: "medium" },
  { id: 65, question: "من قام بتمثيل دور 'توني ستارك' في أفلام مارفل؟", options: ["كريس إيفانز", "روبرت داوني جونيور", "كريس هيمسوورث", "مارك رافالو"], correct: 1, category: "movies", difficulty: "easy" },
  { id: 66, question: "ما هو الفيلم الديزني الذي تدور أحداثه في المملكة المتجمدة؟", options: ["تانغلد", "موانا", "فروزن", "براف"], correct: 2, category: "movies", difficulty: "easy" },
  { id: 67, question: "ما هو اسم الشرير الرئيسي في فيلم 'أسد الملك'؟", options: ["شيلو", "سكار", "رافيكي", "هياناس"], correct: 1, category: "movies", difficulty: "easy" },
  { id: 68, question: "في فيلم 'الرجل العنكبوت'، من لدغه العنكبوت المشع؟", options: ["مايلز موراليس", "بيتر باركر", "هاري أوزبورن", "غويين ستيسي"], correct: 1, category: "movies", difficulty: "easy" },
  { id: 69, question: "ما هو مسلسل الأنمي الذي تحول لفيلم حي في هوليوود عام 2023؟", options: ["ون بيس", "ناروتو", "دراغون بول", "ديث نوت"], correct: 0, category: "movies", difficulty: "medium" },
  { id: 70, question: "من أخرج ثلاثية 'الفارس الأسود'؟", options: ["تيم بيرتون", "كريستوفر نولان", "زاك سنايدر", "ريدلي سكوت"], correct: 1, category: "movies", difficulty: "medium" },
  { id: 71, question: "ما هو الفيلم الذي فيه جملة 'I'll be back'؟", options: ["رامبو", "ذا روك", "ترمينيتور", "أكشن هيرو"], correct: 2, category: "movies", difficulty: "medium" },
  { id: 72, question: "في أي سنة صدر فيلم 'الفك المفترس' (Jaws)؟", options: ["1972", "1975", "1978", "1980"], correct: 1, category: "movies", difficulty: "hard" },
  { id: 73, question: "من هو مؤلف رواية 'هاري بوتر'؟", options: ["ج. ر. تولكين", "ج. ك. رولينغ", "ستيفن كينج", "رولد دال"], correct: 1, category: "movies", difficulty: "easy" },
  { id: 74, question: "ما هو المسلسل الأمريكي الأطول على الإطلاق؟", options: ["The Simpsons", "Grey's Anatomy", "Supernatural", "Law & Order"], correct: 0, category: "movies", difficulty: "medium" },
  { id: 75, question: "من يمثل دور 'جاك' في فيلم تيتانيك؟", options: ["براد بيت", "ليوناردو دي كابريو", "توم هانكس", "جوني ديب"], correct: 1, category: "movies", difficulty: "easy" },

  // ==================== GAMING (76-90) ====================
  { id: 76, question: "ما هي الشركة المصنعة لـ PlayStation؟", options: ["مايكروسوفت", "سوني", "نينتندو", "سيغا"], correct: 1, category: "gaming", difficulty: "easy" },
  { id: 77, question: "ما هو اسم الشخصية الرئيسية في لعبة 'زيلدا'؟", options: ["زيلدا", "لينك", "غانون", "إمبا"], correct: 1, category: "gaming", difficulty: "medium" },
  { id: 78, question: "في أي عام صدرت لعبة 'Minecraft'؟", options: ["2009", "2011", "2013", "2007"], correct: 1, category: "gaming", difficulty: "medium" },
  { id: 79, question: "ما هو الاسم الكامل لـ GTA؟", options: ["Grand Theft Action", "Grand Theft Auto", "Great Theft Auto", "Grand Track Auto"], correct: 1, category: "gaming", difficulty: "easy" },
  { id: 80, question: "ما هي شركة الألعاب التي طورت سلسلة 'Call of Duty'؟", options: ["EA Games", "Activision", "Ubisoft", "Bethesda"], correct: 1, category: "gaming", difficulty: "medium" },
  { id: 81, question: "من هو بطل لعبة 'God of War'؟", options: ["دانتي", "كريتوس", "بيواولف", "أخيل"], correct: 1, category: "gaming", difficulty: "medium" },
  { id: 82, question: "ما هو عدد اللاعبين في المباراة الواحدة في PUBG؟", options: ["50", "100", "150", "200"], correct: 1, category: "gaming", difficulty: "easy" },
  { id: 83, question: "ما هي الشركة المصنعة لـ Xbox؟", options: ["سوني", "مايكروسوفت", "نينتندو", "آبل"], correct: 1, category: "gaming", difficulty: "easy" },
  { id: 84, question: "في لعبة 'ماريو'، ما اسم الأميرة؟", options: ["زيلدا", "بيتش", "روزالينا", "دايزي"], correct: 1, category: "gaming", difficulty: "easy" },
  { id: 85, question: "ما هو أعلى مستوى في لعبة فورتنايت؟", options: ["100", "200", "500", "لا يوجد حد أقصى"], correct: 3, category: "gaming", difficulty: "medium" },
  { id: 86, question: "ما هو اسم الشرير في لعبة 'Zelda'؟", options: ["بوزر", "غانون", "بيوواولف", "شرير"], correct: 1, category: "gaming", difficulty: "medium" },
  { id: 87, question: "في أي عام صدرت أول نسخة من لعبة 'FIFA'؟", options: ["1990", "1993", "1996", "1988"], correct: 1, category: "gaming", difficulty: "hard" },
  { id: 88, question: "ما هو اسم البطل الرئيسي في لعبة 'Red Dead Redemption 2'؟", options: ["جون ماستون", "آرثر مورغان", "ديتش داتش", "بيل ويليامسون"], correct: 1, category: "gaming", difficulty: "medium" },
  { id: 89, question: "ما هي اللعبة الإلكترونية الأكثر مبيعاً على الإطلاق؟", options: ["ماريو", "ماينكرافت", "GTA V", "تتريس"], correct: 1, category: "gaming", difficulty: "hard" },
  { id: 90, question: "ما هي اللعبة التي أطلقتها شركة Epic Games وحققت انتشاراً هائلاً عام 2017؟", options: ["PUBG", "فورتنايت", "Apex Legends", "Warzone"], correct: 1, category: "gaming", difficulty: "easy" },

  // ==================== ANIME (91-105) ====================
  { id: 91, question: "ما هو اسم أب ناروتو؟", options: ["جيرايا", "ميناتو", "ميناتو ناميكازي", "هيروكي"], correct: 2, category: "anime", difficulty: "medium" },
  { id: 92, question: "ما هو اسم الشيطان في جسد ناروتو؟", options: ["كيوبي (الثعلب ذو التسعة أذناب)", "شيتشيبي", "هاتشيبي", "سانبي"], correct: 0, category: "anime", difficulty: "easy" },
  { id: 93, question: "ما هو حلم لوفي في 'ون بيس'؟", options: ["أن يصبح أقوى مقاتل", "أن يجد كنز 'ون بيس' ويصبح ملك القراصنة", "أن يحرر كل المناطق", "أن يغزو العالم"], correct: 1, category: "anime", difficulty: "easy" },
  { id: 94, question: "من هو بطل أنمي 'My Hero Academia' الذي وُلد بدون قوة خارقة؟", options: ["شوتو توداروكي", "إيزوكو ميدوريا", "كاتسوكي باكوغو", "تينيا إيدا"], correct: 1, category: "anime", difficulty: "easy" },
  { id: 95, question: "من رسم أنمي 'Dragon Ball'؟", options: ["ماساشي كيشيموتو", "أكيرا تورياما", "ييتشيرو أوداء", "هاجيمي إيسياما"], correct: 1, category: "anime", difficulty: "medium" },
  { id: 96, question: "في 'Attack on Titan'، ما هو اسم مدينة إيرين بالكامل؟", options: ["إيرين إيغرمان", "إيرين ييغر", "إيرين تيتان", "إيرين ستارك"], correct: 1, category: "anime", difficulty: "easy" },
  { id: 97, question: "ما هو أصل كلمة 'أنمي'؟", options: ["فرنسية", "إنجليزية مختصرة", "يابانية أصيلة", "كورية"], correct: 1, category: "anime", difficulty: "medium" },
  { id: 98, question: "في 'ون بيس'، ما هو اسم سيف زورو الأقوى؟", options: ["شوسوي", "واشو", "إينما", "يوباشيري"], correct: 2, category: "anime", difficulty: "hard" },
  { id: 99, question: "ما هو اسم المحقق في أنمي 'ديث نوت'؟", options: ["ليت", "نير", "ميلو", "L (إل)"], correct: 3, category: "anime", difficulty: "easy" },
  { id: 100, question: "في 'ناروتو'، كم عدد أعضاء الأكاتسكي؟", options: ["7", "10", "12", "8"], correct: 1, category: "anime", difficulty: "medium" },
  { id: 101, question: "ما هو اسم أبو غوكو في 'دراغون بول'؟", options: ["رادتز", "بارداك", "برولي", "توركلز"], correct: 1, category: "anime", difficulty: "medium" },
  { id: 102, question: "في أنمي 'هانتر × هانتر'، ما هو اسم الصديق الأفضل لغون؟", options: ["كيلوا", "كوراپيكا", "ليوريو", "بيسكي"], correct: 0, category: "anime", difficulty: "easy" },
  { id: 103, question: "ما هو الأنمي الذي تدور أحداثه في عالم 'ديمون سلاير'؟", options: ["كيميتسو نو يايبا", "جوجوتسو كايسن", "ماي هيرو أكاديميا", "بليتش"], correct: 0, category: "anime", difficulty: "medium" },
  { id: 104, question: "في 'ون بيس'، ما هو اسم سفينة مجموعة قراصنة قبعة القش الثانية؟", options: ["غوينج ميري", "ثاوزند صني", "ريد فورس", "نايتمير"], correct: 1, category: "anime", difficulty: "medium" },
  { id: 105, question: "من هو مؤلف أنمي 'Fullmetal Alchemist'؟", options: ["هيرومو أراكاوا", "ماساشي كيشيموتو", "أيتشيرو أودا", "تيتسويا تيغا"], correct: 0, category: "anime", difficulty: "hard" },

  // ==================== CARS (106-120) ====================
  { id: 106, question: "ما هي شركة السيارات الأكثر مبيعاً في العالم؟", options: ["تويوتا", "فولكسواغن", "هيونداي", "جنرال موتورز"], correct: 0, category: "cars", difficulty: "medium" },
  { id: 107, question: "ما هو اسم سيارة السباق الأسرع في العالم Bugatti؟", options: ["كيرون", "ڤيرون", "شيرون سوبر سبورت", "دوو"], correct: 2, category: "cars", difficulty: "medium" },
  { id: 108, question: "من هو مؤسس شركة Tesla؟", options: ["بيل غيتس", "ستيف جوبز", "إيلون ماسك", "لاري بيدج"], correct: 2, category: "cars", difficulty: "easy" },
  { id: 109, question: "ما هو بلد المنشأ لسيارة 'فيراري'؟", options: ["ألمانيا", "إيطاليا", "فرنسا", "اليابان"], correct: 1, category: "cars", difficulty: "easy" },
  { id: 110, question: "في أي عام أُسست شركة فورد للسيارات؟", options: ["1895", "1903", "1910", "1898"], correct: 1, category: "cars", difficulty: "medium" },
  { id: 111, question: "ما هي أسرع سيارة في العالم حسب سجل غينيس؟", options: ["بوغاتي فيرون", "كوينيغسيغ آغيرا", "ThrustSSC", "هينيسي فينوم GT"], correct: 2, category: "cars", difficulty: "hard" },
  { id: 112, question: "ما هو مصدر طاقة السيارات الكهربائية؟", options: ["الهيدروجين", "البطارية الكهربائية", "الشمس", "الرياح"], correct: 1, category: "cars", difficulty: "easy" },
  { id: 113, question: "ما هي الدولة التي تصنع سيارات BMW؟", options: ["السويد", "ألمانيا", "اليابان", "فرنسا"], correct: 1, category: "cars", difficulty: "easy" },
  { id: 114, question: "ما هو اسم شعار شركة مرسيدس بنز؟", options: ["نجمة ثلاثية الأطراف", "حرف M", "دائرة ونقطة", "أسد مجنح"], correct: 0, category: "cars", difficulty: "medium" },
  { id: 115, question: "متى تأسست شركة لمبرغيني للسيارات؟", options: ["1940", "1963", "1975", "1955"], correct: 1, category: "cars", difficulty: "hard" },
  { id: 116, question: "كم عجلة للسيارة عادةً؟", options: ["2", "4", "6", "3"], correct: 1, category: "cars", difficulty: "easy" },
  { id: 117, question: "ما هي الشركة الأم لعلامة 'أودي'؟", options: ["BMW", "فولكسواغن", "مرسيدس", "بورشه"], correct: 1, category: "cars", difficulty: "medium" },
  { id: 118, question: "ما هو مصطلح 'Horsepower' بالعربية؟", options: ["قوة الرياح", "حصان قوة", "قوة المحرك", "طاقة الدفع"], correct: 1, category: "cars", difficulty: "easy" },
  { id: 119, question: "ما هي الدولة الأصلية لسيارة 'تويوتا'؟", options: ["الصين", "اليابان", "كوريا الجنوبية", "الهند"], correct: 1, category: "cars", difficulty: "easy" },
  { id: 120, question: "ما هو نوع الوقود الذي تستخدمه سيارة الديزل؟", options: ["البنزين", "الديزل (الغاز)", "الكيروسين", "الغاز الطبيعي"], correct: 1, category: "cars", difficulty: "easy" },

  // ==================== GULF FOOD (121-135) ====================
  { id: 121, question: "ما هو الطبق الوطني للمملكة العربية السعودية؟", options: ["الكبسة", "المندي", "الهريس", "الجريش"], correct: 0, category: "food", difficulty: "easy" },
  { id: 122, question: "ما هو مكون 'القهوة العربية' المميز؟", options: ["الهيل والزعفران", "القرفة والقرنفل", "الكمون والكركم", "الفلفل والزنجبيل"], correct: 0, category: "food", difficulty: "medium" },
  { id: 123, question: "ما هو اسم الخبز الرقيق الإماراتي الشعبي؟", options: ["الرقاق", "الخبز", "الفطير", "المرقوق"], correct: 0, category: "food", difficulty: "medium" },
  { id: 124, question: "في أي موسم يُعد 'الهريس' في الخليج عادةً؟", options: ["رمضان", "العيد", "رأس السنة", "كل المناسبات"], correct: 3, category: "food", difficulty: "medium" },
  { id: 125, question: "ما هو المكون الأساسي في طبق 'المطبق'؟", options: ["الأرز", "اللحم والخضروات مع العجين", "السمك", "الدجاج"], correct: 1, category: "food", difficulty: "medium" },
  { id: 126, question: "ما هي المادة الحلوة التي تُضاف لـ 'اللقيمات'؟", options: ["السكر فقط", "العسل أو الديبس", "الشيرة", "التمر"], correct: 1, category: "food", difficulty: "easy" },
  { id: 127, question: "ما هو شراب الترحيب الخليجي التقليدي؟", options: ["الشاي", "القهوة العربية", "عصير الليمون", "ماء الورد"], correct: 1, category: "food", difficulty: "easy" },
  { id: 128, question: "ما اسم الحلوى الكويتية الشهيرة المصنوعة من الدقيق والسكر؟", options: ["البسبوسة", "المحلبية", "الدنقر", "الحلوى الكويتية"], correct: 3, category: "food", difficulty: "hard" },
  { id: 129, question: "ما هو أشهر أكلة في الإفطار الخليجي؟", options: ["الفول والفلافل", "البيض مع اللحم", "الخبز والعسل", "التمر واللبن"], correct: 3, category: "food", difficulty: "easy" },
  { id: 130, question: "ما هو الطبق البحريني الشهير المحضر من السمك؟", options: ["الحوت المشوي", "الصالونة", "المشخوول", "السمك بالسلق"], correct: 2, category: "food", difficulty: "hard" },
  { id: 131, question: "ما هو التمر الأشهر في المملكة العربية السعودية؟", options: ["الدقلة نور", "المدينة أو المجدول", "الخلاص", "السكري"], correct: 3, category: "food", difficulty: "medium" },
  { id: 132, question: "ما هو طبق اليمن الوطني الشهير؟", options: ["المندي", "الفسيخ", "السلتة", "الأحمر"], correct: 2, category: "food", difficulty: "medium" },
  { id: 133, question: "ما هي العلكة التقليدية في الخليج؟", options: ["اللبان الدكر", "علكة البطيخ", "اللبان العماني", "الكاكاو"], correct: 0, category: "food", difficulty: "medium" },
  { id: 134, question: "ما هو المشروب الذي يصنع من ماء الزهر في الخليج؟", options: ["الشاي بالهيل", "اللقيمات", "قهوة الزهر", "شراب الوردة"], correct: 0, category: "food", difficulty: "hard" },
  { id: 135, question: "ما هو اسم الطبق الإماراتي المصنوع من الخبز ومرق اللحم؟", options: ["الثريد", "الهريس", "المربيان", "الصالونة"], correct: 0, category: "food", difficulty: "medium" },

  // ==================== BUSINESS & ENTREPRENEURSHIP (136-150) ====================
  { id: 136, question: "من هو أغنى شخص في العالم عام 2023؟", options: ["بيل غيتس", "إيلون ماسك", "جيف بيزوس", "برنار أرنو"], correct: 1, category: "business", difficulty: "medium" },
  { id: 137, question: "ما هو اختصار 'CEO'؟", options: ["Chief Economic Officer", "Chief Executive Officer", "Chief Earning Officer", "Corporate Executive Officer"], correct: 1, category: "business", difficulty: "easy" },
  { id: 138, question: "في أي سنة أسس جيف بيزوس شركة أمازون؟", options: ["1992", "1994", "1996", "1998"], correct: 1, category: "business", difficulty: "medium" },
  { id: 139, question: "ما هو معنى 'IPO'؟", options: ["الطرح العام الأولي", "الشراكة الدولية", "أسهم المالك الخاص", "استثمار خاص جديد"], correct: 0, category: "business", difficulty: "medium" },
  { id: 140, question: "ما هي أكبر شركة في العالم حسب القيمة السوقية عام 2024؟", options: ["آبل", "مايكروسوفت", "أرامكو", "ألفابت"], correct: 0, category: "business", difficulty: "medium" },
  { id: 141, question: "من أسس شركة 'Apple'؟", options: ["بيل غيتس", "ستيف جوبز وستيف وزنياك ورون واين", "مارك زوكربرغ", "لاري بيدج"], correct: 1, category: "business", difficulty: "easy" },
  { id: 142, question: "ما هي قيمة شركة أرامكو السعودية تقريباً؟", options: ["تريليون دولار", "تريليوني دولار", "3 تريليون دولار", "500 مليار دولار"], correct: 2, category: "business", difficulty: "hard" },
  { id: 143, question: "ما هو معنى 'Startup'؟", options: ["شركة قديمة", "شركة ناشئة", "شركة حكومية", "شركة متعددة الجنسيات"], correct: 1, category: "business", difficulty: "easy" },
  { id: 144, question: "من هو أكبر مساهم في شركة 'Berkshire Hathaway'؟", options: ["جورج سوروس", "وارن بافيت", "بيل غيتس", "كارلوس سليم"], correct: 1, category: "business", difficulty: "medium" },
  { id: 145, question: "ما هي عملة بيتكوين المختصرة؟", options: ["BTC", "ETH", "XRP", "USDT"], correct: 0, category: "business", difficulty: "easy" },
  { id: 146, question: "في أي عام تأسست شركة 'Google'؟", options: ["1996", "1998", "2000", "2002"], correct: 1, category: "business", difficulty: "medium" },
  { id: 147, question: "ما هو معنى 'ROI' في الأعمال؟", options: ["العائد على الاستثمار", "الربح الصافي الأولي", "معدل نمو الفائدة", "نسبة الإيرادات للمصروفات"], correct: 0, category: "business", difficulty: "medium" },
  { id: 148, question: "ما هو اسم أكبر سوق للأوراق المالية في العالم؟", options: ["بورصة لندن", "بورصة نيويورك (NYSE)", "بورصة طوكيو", "بورصة هونج كونج"], correct: 1, category: "business", difficulty: "medium" },
  { id: 149, question: "من هو مؤسس شركة 'Alibaba'؟", options: ["جاك ما", "رين تشنغفي", "لي كاشينج", "بوني ما"], correct: 0, category: "business", difficulty: "medium" },
  { id: 150, question: "ما هي رؤية المملكة العربية السعودية الاقتصادية؟", options: ["رؤية 2030", "رؤية 2050", "رؤية 2040", "رؤية 2025"], correct: 0, category: "business", difficulty: "easy" },

  // ==================== SCIENCE & TECH (151-165) ====================
  { id: 151, question: "ما هو الجدول الدوري للعناصر الكيميائية؟", options: ["قائمة المواد الغذائية", "ترتيب العناصر حسب العدد الذري", "قائمة المعادن", "تصنيف الجزيئات"], correct: 1, category: "science", difficulty: "easy" },
  { id: 152, question: "من وضع نظرية النسبية؟", options: ["نيوتن", "أينشتاين", "هوكينغ", "ماكسويل"], correct: 1, category: "science", difficulty: "easy" },
  { id: 153, question: "ما هي أسرع موجات الضوء في الفراغ تقريباً؟", options: ["200,000 كم/ث", "300,000 كم/ث", "400,000 كم/ث", "500,000 كم/ث"], correct: 1, category: "science", difficulty: "medium" },
  { id: 154, question: "ما هو عدد كروموسومات الإنسان الطبيعي؟", options: ["44", "46", "48", "23"], correct: 1, category: "science", difficulty: "medium" },
  { id: 155, question: "ما هي اللغة الأكثر استخداماً في البرمجة؟", options: ["Java", "Python", "C++", "JavaScript"], correct: 1, category: "science", difficulty: "medium" },
  { id: 156, question: "ما هو اختصار 'AI'؟", options: ["إنترنت متقدم", "الذكاء الاصطناعي", "اندماج الأفكار", "أتمتة الإنترنت"], correct: 1, category: "science", difficulty: "easy" },
  { id: 157, question: "ما هو العنصر الأكثر وفرة على سطح الأرض؟", options: ["الحديد", "الأكسجين", "السيليكون", "الألومنيوم"], correct: 1, category: "science", difficulty: "medium" },
  { id: 158, question: "من اخترع الهاتف؟", options: ["توماس إديسون", "ألكسندر غراهام بيل", "نيكولا تسلا", "مارسيلو ماركوني"], correct: 1, category: "science", difficulty: "easy" },
  { id: 159, question: "ما هو الجهاز الذي يقيس قوة الزلازل؟", options: ["الباروميتر", "الثيرمومتر", "السيسموغراف", "المقياس الجيولوجي"], correct: 2, category: "science", difficulty: "medium" },
  { id: 160, question: "ما هو اختصار DNA؟", options: ["Deoxyribonucleic Acid", "Dynamic Nucleic Array", "Dual Nitrogen Acid", "Direct Nucleotide Agent"], correct: 0, category: "science", difficulty: "medium" },
  { id: 161, question: "كم وحدة في كيلوبايت واحد؟", options: ["100 بايت", "1000 بايت", "1024 بايت", "512 بايت"], correct: 2, category: "science", difficulty: "medium" },
  { id: 162, question: "ما هو كوكب المريخ المعروف بلونه الأحمر؟", options: ["كوكب الحرب", "كوكب الدم", "الكوكب الأحمر", "كوكب النار"], correct: 2, category: "science", difficulty: "easy" },
  { id: 163, question: "من أسس شركة 'SpaceX'؟", options: ["جيف بيزوس", "إيلون ماسك", "ريتشارد برانسون", "بيل غيتس"], correct: 1, category: "science", difficulty: "easy" },
  { id: 164, question: "ما هو الغاز الذي تتنفسه النباتات؟", options: ["الأكسجين", "ثاني أكسيد الكربون", "النيتروجين", "الهيدروجين"], correct: 1, category: "science", difficulty: "easy" },
  { id: 165, question: "ما هي ظاهرة 'الاحترار العالمي' ناتجة عنها؟", options: ["تقلص طبقة الأوزون", "انبعاثات ثاني أكسيد الكربون والغازات الدفيئة", "تلوث البحار", "إزالة الغابات فقط"], correct: 1, category: "science", difficulty: "medium" },

  // ==================== ARAB HISTORY (166-180) ====================
  { id: 166, question: "من هو أول خليفة في الإسلام؟", options: ["عمر بن الخطاب", "أبو بكر الصديق", "علي بن أبي طالب", "عثمان بن عفان"], correct: 1, category: "arabhistory", difficulty: "easy" },
  { id: 167, question: "ما هو تاريخ توحيد المملكة العربية السعودية؟", options: ["1902", "1932", "1945", "1918"], correct: 1, category: "arabhistory", difficulty: "medium" },
  { id: 168, question: "من هو مؤسس الدولة العباسية؟", options: ["هارون الرشيد", "أبو جعفر المنصور", "أبو العباس السفاح", "المأمون"], correct: 2, category: "arabhistory", difficulty: "hard" },
  { id: 169, question: "في أي عام فتح صلاح الدين الأيوبي القدس؟", options: ["1182", "1187", "1192", "1200"], correct: 1, category: "arabhistory", difficulty: "medium" },
  { id: 170, question: "ما هو اسم الدولة التي كانت عاصمتها بغداد في العصر الذهبي؟", options: ["الدولة الأموية", "الدولة العباسية", "الدولة الفاطمية", "الدولة الأيوبية"], correct: 1, category: "arabhistory", difficulty: "medium" },
  { id: 171, question: "من هو المعالم البارزة في الحضارة الإسلامية؟", options: ["ابن سينا وابن رشد وابن خلدون", "بطليموس وأرسطو وأفلاطون", "كبلر وغاليليو ونيوتن", "ديكارت وكانط وهيغل"], correct: 0, category: "arabhistory", difficulty: "medium" },
  { id: 172, question: "متى تأسست جامعة الدول العربية؟", options: ["1940", "1945", "1950", "1960"], correct: 1, category: "arabhistory", difficulty: "medium" },
  { id: 173, question: "في أي عام اكتُشف النفط في السعودية؟", options: ["1930", "1938", "1945", "1960"], correct: 1, category: "arabhistory", difficulty: "medium" },
  { id: 174, question: "ما هو اسم المدينة الإسلامية التي كانت تُسمى 'مركز العلوم' في العصر العباسي؟", options: ["دمشق", "القاهرة", "بغداد", "قرطبة"], correct: 2, category: "arabhistory", difficulty: "medium" },
  { id: 175, question: "من هو المفكر العربي الذي ألّف كتاب 'المقدمة' في علم التاريخ والاجتماع؟", options: ["ابن سينا", "ابن خلدون", "الفارابي", "ابن رشد"], correct: 1, category: "arabhistory", difficulty: "medium" },
  { id: 176, question: "ما هو اسم أول امبراطورية إسلامية؟", options: ["العباسية", "الأموية", "الراشدية", "الفاطمية"], correct: 2, category: "arabhistory", difficulty: "medium" },
  { id: 177, question: "ما هي المعركة التي انتصر فيها المسلمون على الفرس؟", options: ["معركة بدر", "معركة القادسية", "معركة اليرموك", "معركة حطين"], correct: 1, category: "arabhistory", difficulty: "medium" },
  { id: 178, question: "في أي سنة سقطت الخلافة العثمانية؟", options: ["1918", "1922", "1924", "1930"], correct: 2, category: "arabhistory", difficulty: "hard" },
  { id: 179, question: "ما هو لقب الحاكم العربي الذي وحّد مصر والشام؟", options: ["السلطان", "صلاح الدين الأيوبي", "القائد", "الأمير"], correct: 1, category: "arabhistory", difficulty: "medium" },
  { id: 180, question: "من هو مؤلف كتاب 'ألف ليلة وليلة'؟", options: ["مؤلف مجهول جمعي", "ابن المقفع", "الجاحظ", "أبو نواس"], correct: 0, category: "arabhistory", difficulty: "hard" },

  // ==================== ANIMALS & NATURE (181-195) ====================
  { id: 181, question: "ما هو أكبر حيوان بري في العالم؟", options: ["الزرافة", "الفيل الأفريقي", "فرس النهر", "وحيد القرن"], correct: 1, category: "animals", difficulty: "easy" },
  { id: 182, question: "كم عدد قلوب الأخطبوط؟", options: ["1", "2", "3", "4"], correct: 2, category: "animals", difficulty: "hard" },
  { id: 183, question: "ما هو أطول حيوان في العالم؟", options: ["الفيل", "الزرافة", "الحوت الأزرق", "ثعبان الأناكوندا"], correct: 2, category: "animals", difficulty: "medium" },
  { id: 184, question: "ما هو الحيوان الوحيد الذي لا ينسى؟", options: ["الدلفين", "الفيل", "الغوريلا", "الحوت"], correct: 1, category: "animals", difficulty: "easy" },
  { id: 185, question: "كم عدد أرجل العنكبوت؟", options: ["6", "8", "10", "4"], correct: 1, category: "animals", difficulty: "easy" },
  { id: 186, question: "ما هو الحيوان الوحيد الذي يستطيع التعرف على نفسه في المرآة؟", options: ["القرد", "الدلفين", "الفيل والدلفين والشمبانزي", "الببغاء"], correct: 2, category: "animals", difficulty: "hard" },
  { id: 187, question: "ما هو اسم الحيوان الذي يضع بيضاً وهو ثديي؟", options: ["الكنغر", "خز الماء", "الخفاش", "الثعلب المطير"], correct: 1, category: "animals", difficulty: "medium" },
  { id: 188, question: "ما هو الحيوان الذي يبني سدوداً على الأنهار؟", options: ["الثعلب", "القندس", "الغابير", "الكاسر"], correct: 1, category: "animals", difficulty: "easy" },
  { id: 189, question: "ما هو أسرع حيوان بري على الأرض؟", options: ["الأسد", "الفهد", "الغزال", "الذئب"], correct: 1, category: "animals", difficulty: "easy" },
  { id: 190, question: "ما هو الحيوان الأطول عمراً في العالم؟", options: ["السلحفاة البرية", "الحوت الجرينلاندي", "الببغاء", "الفيل"], correct: 1, category: "animals", difficulty: "hard" },
  { id: 191, question: "كم عدد الأسنان اللبنية للأطفال؟", options: ["16", "20", "24", "28"], correct: 1, category: "animals", difficulty: "medium" },
  { id: 192, question: "ما هو الطائر الوحيد الذي لا يطير؟", options: ["البطريق", "الدجاج", "الإوز", "كلها لا تطير"], correct: 0, category: "animals", difficulty: "easy" },
  { id: 193, question: "ما هو اسم صغير الأسد؟", options: ["جرو", "شبل", "فرخ", "جحش"], correct: 1, category: "animals", difficulty: "easy" },
  { id: 194, question: "ما هو النبات الذي يعيش في الصحراء ويخزن الماء؟", options: ["الصبار", "الورد", "الجلنار", "التوليب"], correct: 0, category: "animals", difficulty: "easy" },
  { id: 195, question: "ما هو اسم الحيوان الذي يبيت شتاءً؟", options: ["الحمامة", "الدب", "الغزال", "النمر"], correct: 1, category: "animals", difficulty: "easy" },

  // ==================== POP CULTURE (196-210) ====================
  { id: 196, question: "ما هي منصة التواصل الاجتماعي التي يملكها إيلون ماسك؟", options: ["فيسبوك", "X (تويتر)", "إنستغرام", "تيك توك"], correct: 1, category: "popculture", difficulty: "easy" },
  { id: 197, question: "ما هي أشهر أغنية لأم كلثوم؟", options: ["أنت عمري", "ست الحبايب", "الأطلال", "كلها شهيرة جداً"], correct: 3, category: "popculture", difficulty: "medium" },
  { id: 198, question: "من هو المطرب العربي الأشهر على يوتيوب؟", options: ["عمرو دياب", "وائل كفوري", "محمد عبده", "شيرين"], correct: 0, category: "popculture", difficulty: "hard" },
  { id: 199, question: "ما هي التطبيق الذي أطلق ظاهرة الفيديوهات القصيرة عالمياً؟", options: ["إنستغرام ريلز", "يوتيوب شورتس", "تيك توك", "سناب شات"], correct: 2, category: "popculture", difficulty: "easy" },
  { id: 200, question: "ما هي أشهر علامة هاشتاق في تاريخ تويتر؟", options: ["#love", "#MeToo", "#BlackLivesMatter", "#COVID19"], correct: 0, category: "popculture", difficulty: "hard" },
  { id: 201, question: "من هو مؤسس منصة 'يوتيوب'؟", options: ["مارك زوكربرغ", "ثلاثة مؤسسين: جاويد وهيرلي وتشن", "جاك دورسي", "لاري بيدج"], correct: 1, category: "popculture", difficulty: "medium" },
  { id: 202, question: "ما هو برنامج الواقع الأمريكي الذي اشتهر به باراك أوباما قبل الرئاسة؟", options: ["Oprah Winfrey Show", "The View", "American Idol", "لم يظهر في برامج واقعية"], correct: 3, category: "popculture", difficulty: "hard" },
  { id: 203, question: "ما هو مفهوم 'الميم' (Meme)؟", options: ["صورة مضحكة فقط", "وحدة ثقافية تنتشر عبر الإنترنت", "فيديو قصير", "نكتة مكتوبة فقط"], correct: 1, category: "popculture", difficulty: "medium" },
  { id: 204, question: "ما هي أغنية BTS الأكثر مشاهدة على يوتيوب؟", options: ["Dynamite", "Boy With Luv", "Butter", "DNA"], correct: 0, category: "popculture", difficulty: "hard" },
  { id: 205, question: "ما هو اسم منصة البث التي أنتجت 'Squid Game'؟", options: ["هولو", "Netflix", "Disney+", "Amazon Prime"], correct: 1, category: "popculture", difficulty: "easy" },
  { id: 206, question: "ما هو التطبيق العربي الأشهر للقصص القصيرة؟", options: ["بياناتي", "نون", "واتباد", "كيو"], correct: 1, category: "popculture", difficulty: "hard" },
  { id: 207, question: "من هو الشخص الأكثر متابعة على إنستغرام؟", options: ["كايلي جينر", "كريستيانو رونالدو", "سيلينا غوميز", "دوا ليبا"], correct: 1, category: "popculture", difficulty: "medium" },
  { id: 208, question: "ما هو عدد متابعي كريستيانو رونالدو على إنستغرام تقريباً (2024)؟", options: ["400 مليون", "600 مليون", "800 مليون", "مليار"], correct: 2, category: "popculture", difficulty: "hard" },
  { id: 209, question: "ما هو اسم برنامج الذكاء الاصطناعي الأشهر في 2023؟", options: ["Siri", "ChatGPT", "Alexa", "Cortana"], correct: 1, category: "popculture", difficulty: "easy" },
  { id: 210, question: "ما هو معنى كلمة 'Viral' على الإنترنت؟", options: ["مرض رقمي", "انتشار واسع سريع", "تعليق سلبي", "إعلان مدفوع"], correct: 1, category: "popculture", difficulty: "easy" },

  // ==================== LEGENDS - PREMIUM (211-225) ====================
  { id: 211, question: "ما هو الاسم الكامل لمدينة إسطنبول قبل الفتح العثماني؟", options: ["الروم", "القسطنطينية", "بيزنطة", "ب وج صحيحان"], correct: 3, category: "legends", difficulty: "hard" },
  { id: 212, question: "كم عدد نجوم علم الاتحاد الأوروبي؟", options: ["10", "12", "15", "27"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 213, question: "ما هو الكوكب الذي يدور حول الشمس في الاتجاه المعاكس لسائر الكواكب؟", options: ["المريخ", "الزهرة", "زحل", "عطارد"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 214, question: "كم عدد العظام في جسم الإنسان البالغ؟", options: ["196", "206", "216", "226"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 215, question: "في أي عام أُرسلت أول رسالة بريد إلكتروني في التاريخ؟", options: ["1969", "1971", "1975", "1980"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 216, question: "ما هو الدولة الوحيدة التي تمتد على قارتين؟", options: ["روسيا", "تركيا", "مصر وروسيا وتركيا", "كازاخستان"], correct: 2, category: "legends", difficulty: "hard" },
  { id: 217, question: "ما هو أقل عدد من الألوان لتلوين أي خريطة بحيث لا يتجاور لونان متشابهان؟", options: ["3", "4", "5", "6"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 218, question: "ما هي الظاهرة الفلكية التي تحدث عندما تمر الأرض بين الشمس والقمر؟", options: ["كسوف الشمس", "خسوف القمر", "الكسوف الكلي", "الاقتران"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 219, question: "كم سنة لتدور مجرة درب التبانة حول مركزها؟", options: ["100 مليون سنة", "225 مليون سنة", "500 مليون سنة", "مليار سنة"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 220, question: "ما هو اسم أول حاسوب إلكتروني في التاريخ؟", options: ["UNIVAC", "ENIAC", "IBM 701", "MARK I"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 221, question: "كم عدد المقاطعات الفيدرالية في الولايات المتحدة الأمريكية؟", options: ["48", "50", "51", "52"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 222, question: "ما هو اسم أول امرأة حصلت على جائزة نوبل؟", options: ["مارغريت كوري", "ماري كوري", "روزاليند فرانكلين", "ليزا ميتنر"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 223, question: "ما هو عدد أوتار الجيتار القياسية؟", options: ["4", "5", "6", "7"], correct: 2, category: "legends", difficulty: "hard" },
  { id: 224, question: "ما هي النسبة المئوية للأكسجين في الغلاف الجوي للأرض؟", options: ["16%", "21%", "28%", "35%"], correct: 1, category: "legends", difficulty: "hard" },
  { id: 225, question: "كم عدد الشركاء المؤسسين لشركة 'Microsoft'؟", options: ["1", "2", "3", "4"], correct: 1, category: "legends", difficulty: "hard" },
];

export function getQuestionsByCategory(categoryId: string, count?: number): Question[] {
  const filtered = questions.filter(q => q.category === categoryId);
  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  return count ? shuffled.slice(0, count) : shuffled;
}

export function getRandomQuestions(count: number = 10): Question[] {
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function getCategoryById(id: string): Category | undefined {
  return CATEGORIES.find(c => c.id === id);
}
