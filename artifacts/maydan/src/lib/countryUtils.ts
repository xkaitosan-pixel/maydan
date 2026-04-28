export const COUNTRIES = [
  { code: "QA", flag: "🇶🇦", name: "قطر" },
  { code: "SA", flag: "🇸🇦", name: "السعودية" },
  { code: "AE", flag: "🇦🇪", name: "الإمارات" },
  { code: "KW", flag: "🇰🇼", name: "الكويت" },
  { code: "BH", flag: "🇧🇭", name: "البحرين" },
  { code: "OM", flag: "🇴🇲", name: "عُمان" },
  { code: "EG", flag: "🇪🇬", name: "مصر" },
  { code: "JO", flag: "🇯🇴", name: "الأردن" },
  { code: "LB", flag: "🇱🇧", name: "لبنان" },
  { code: "IQ", flag: "🇮🇶", name: "العراق" },
  { code: "YE", flag: "🇾🇪", name: "اليمن" },
  { code: "SY", flag: "🇸🇾", name: "سوريا" },
  { code: "MA", flag: "🇲🇦", name: "المغرب" },
  { code: "DZ", flag: "🇩🇿", name: "الجزائر" },
  { code: "TN", flag: "🇹🇳", name: "تونس" },
  { code: "LY", flag: "🇱🇾", name: "ليبيا" },
  { code: "SD", flag: "🇸🇩", name: "السودان" },
  { code: "PS", flag: "🇵🇸", name: "فلسطين" },
  { code: "SO", flag: "🇸🇴", name: "الصومال" },
  { code: "MR", flag: "🇲🇷", name: "موريتانيا" },
];

export function getCountryFlag(code: string): string {
  return COUNTRIES.find(c => c.code === code)?.flag ?? "";
}
