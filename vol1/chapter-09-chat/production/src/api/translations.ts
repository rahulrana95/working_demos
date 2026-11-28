/*
 * NOT PART OF THE INTERVIEW.
 * Texts for the demo page in three languages. Arabic is written from right
 * to left, so it also shows that the layout mirrors itself.
 */
import type { ChatMessages } from "../chat";

export interface Language {
  name: string;
  /** For the time of a message. */
  locale: string;
  dir: "ltr" | "rtl";
  /** Empty for English: the component has English texts built in. */
  messages: Partial<ChatMessages>;
}

export const LANGUAGES: Record<string, Language> = {
  en: { name: "English", locale: "en-IN", dir: "ltr", messages: {} },
  hi: {
    name: "हिन्दी",
    locale: "hi-IN",
    dir: "ltr",
    messages: {
      you: "आप",
      sending: "भेजा जा रहा है…",
      sent: "भेजा गया",
      delivered: "पहुँच गया",
      read: "पढ़ा गया",
      failed: "नहीं भेजा गया",
      retry: "फिर से भेजें",
      loadOlder: "पुराने संदेश लोड करें",
      loading: "लोड हो रहा है…",
      loadFailed: "संदेश लोड नहीं हो सके।",
      newMessages: "नए संदेश",
      connecting: "कनेक्ट हो रहा है… कनेक्शन वापस आने पर आपके संदेश भेजे जाएँगे।",
      composerLabel: "संदेश",
      send: "भेजें",
      typing: "{name} लिख रहे हैं…",
      attachImage: "चित्र भेजें",
      uploading: "अपलोड हो रहा है, {percent}%",
      cancelUpload: "रद्द करें",
      imageRefused: "यह फ़ाइल नहीं भेजी जा सकती। 5 MB या उससे छोटा चित्र चुनें।",
      image: "चित्र",
      conversations: "बातचीत",
      conversationsFailed: "बातचीत लोड नहीं हो सकीं।",
      noMessagesYet: "अभी कोई संदेश नहीं",
      unread: { one: "{count} अपठित संदेश", other: "{count} अपठित संदेश" },
      notificationTitle: "{name} का नया संदेश",
    },
  },
  ar: {
    name: "العربية",
    locale: "ar-EG",
    dir: "rtl",
    messages: {
      you: "أنت",
      sending: "جارٍ الإرسال…",
      sent: "أُرسلت",
      delivered: "تم التسليم",
      read: "قُرئت",
      failed: "لم تُرسل",
      retry: "إعادة المحاولة",
      loadOlder: "تحميل الرسائل الأقدم",
      loading: "جارٍ التحميل…",
      loadFailed: "تعذّر تحميل الرسائل.",
      newMessages: "رسائل جديدة",
      connecting: "جارٍ الاتصال… ستُرسل رسائلك عند عودة الاتصال.",
      composerLabel: "رسالة",
      send: "إرسال",
      typing: "{name} يكتب…",
      attachImage: "إرسال صورة",
      uploading: "جارٍ الرفع، {percent}%",
      cancelUpload: "إلغاء",
      imageRefused: "لا يمكن إرسال هذا الملف. اختر صورة بحجم 5 ميغابايت أو أقل.",
      image: "صورة",
      conversations: "المحادثات",
      conversationsFailed: "تعذّر تحميل المحادثات.",
      noMessagesYet: "لا توجد رسائل بعد",
      // Arabic has six plural forms.
      unread: {
        zero: "لا رسائل غير مقروءة",
        one: "رسالة واحدة غير مقروءة",
        two: "رسالتان غير مقروءتين",
        few: "{count} رسائل غير مقروءة",
        many: "{count} رسالة غير مقروءة",
        other: "{count} رسالة غير مقروءة",
      },
      notificationTitle: "رسالة جديدة من {name}",
    },
  },
};
