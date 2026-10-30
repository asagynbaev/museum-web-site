// Copied from ai-concierge/web/src/live/reply-guards.ts by scripts/export-museum.mjs - edit it there and export again.
// Checks of a finished reply's language. Each failed check asks the model once to redo the reply (main.ts and
// embed/bars-concierge.ts send the returned text as "[Система: ...]").
import type { Lang } from './session';

// Turkish leaking into a Kyrgyz session shows up in the transcript as Latin letters / Turkish words.
const TURKISH = /[şğıİ]|\bmerhaba\b|teşekkür|\bevet\b|\bhayır\b|hoş geldiniz|\bnasılsınız\b/i;
// a reply in a fourth language (the recognition heard Spanish / French / German in a short noisy phrase)
const FOREIGN = /[ñ¿¡]|\b(hola|gracias|buenos|bienvenid[oa]s?|boletos?|entradas?|cuesta|bonjour|merci|billets?|guten|danke|willkommen)\b/i;
// Kyrgyz number words inside a Russian reply ("стоит миң алты жүз сом")
const CW = 'а-яёөүңіїєґәғқұһў';   // Cyrillic word letters (a JS word boundary only knows ASCII words)
const MIXED_RU = new RegExp(
  `[а-яё]{3,}[^а-яё]{0,40}(?<![${CW}])(миң|жүз|бир|эки|үч|төрт|беш|алты|жети|сегиз|тогуз|сом)(?![${CW}])[^а-яё]{0,40}[а-яё]{3,}`, 'i');
// a Cyrillic language the museum does not speak: Ukrainian / Belarusian / Kazakh letters, Ukrainian-only words
const OTHER_CYR = new RegExp(
  `[іїєґәғқұһў]|(?<![${CW}])(що|якщо|ще|допомог\\S*|дякую|будь ласка|звертайте\\S*|дізна\\S*|вітаю|привіт)(?![${CW}])`, 'i');
const CYR = /[а-яёөүң]/i;
// kana and kanji: a Japanese session's reply (the /bars page's Japanese leopard) must have some
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
const WANT: Record<Lang, string> = { ky: 'по-кыргызски', en: 'по-английски', ja: 'по-японски', ru: 'по-русски', auto: 'по-русски' };
// a Russian reply, perhaps with a few Kyrgyz number words in it (a Kyrgyz reply has them in most of its words)
const isRussianText = (s: string): boolean => {
  const words = s.split(/\s+/).filter(Boolean);
  const ky = words.filter((w) => /[өүң]/i.test(w)).length;
  return CYR.test(s) && ky <= 3 && ky < 0.25 * words.length;
};
// Which of the museum's Cyrillic languages a phrase is in (null: can't tell): an undecided session must answer each
// guest phrase in its own language - it answered a Russian «Спасибо большое, всё понятно» in Kyrgyz
const RU_WORDS = new RegExp(`(?<![${CW}])(спасибо|пожалуйста|здравствуйте|привет|понятно|хорошо|сколько|когда|где|что|как|это|можно|скажите|подскажите|вы|вас|вам|мне|мы|рада|рады|была|будем|наш\\S*|ждём|ждем|очень|до свидания)(?![${CW}])`, 'gi');
const KY_WORDS = new RegExp(`(?<![${CW}])(рахмат|саламатсызбы|салам|канча|качан|кайда|эмне|кандай|жакшы|ооба|жок|барбы|болобу|сураныч|сиз|сизге|мен|биз|керек|жардам\\S*|эмес|болсо|кубаныч\\S*|арзыбайт|дагы|абдан|ачык|менен)(?![${CW}])`, 'gi');
function cyrLang(s: string): 'ru' | 'ky' | null {
  if (!CYR.test(s)) return null;
  const words = s.split(/\s+/).filter(Boolean);
  const kyLetters = words.filter((w) => /[өүң]/i.test(w)).length;   // (Russian has no ө, ү, ң)
  const ky = (s.match(KY_WORDS) ?? []).length;
  const ru = (s.match(RU_WORDS) ?? []).length;
  if (ky >= 2 || (ky >= 1 && ru === 0) || (kyLetters >= 2 && kyLetters >= 0.15 * words.length)) return 'ky';
  if (ru >= 1 && ky === 0 && kyLetters === 0) return 'ru';
  return null;
}

/**
 * What to ask the model to redo in its reply `botText` (to the guest's `userText`), or null if the reply is fine:
 * a Kyrgyz / undecided session answered in Turkish; any session answered in a fourth language (a misheard phrase
 * taken for Spanish etc.) or with Ukrainian words; an undecided session answered in the other Cyrillic language;
 * Kyrgyz number words in a Russian reply; a Japanese phrase (or a Japanese session) answered in another language.
 */
export function replyFix(botText: string, userText: string, lang: Lang): string | null {
  if (!botText) return null;
  if ((lang === 'ky' || lang === 'auto') && TURKISH.test(botText)) {
    return 'ответ прозвучал по-турецки. Повтори то же самое по-кыргызски, кириллицей.';
  }
  if (FOREIGN.test(botText) && !CYR.test(botText)) {
    return `ответ прозвучал не на языке музея. Повтори то же самое ${WANT[lang]}, коротко.`;
  }
  if (OTHER_CYR.test(botText)) {
    // Ukrainian (or Kazakh) words in a reply: "Всегда рада допомогти. Якщо захочете ще щось дізнатися..."
    return `в ответе украинские слова — у музея нет украинского. Повтори то же самое целиком ${WANT[lang]}.`;
  }
  // Japanese: a Japanese session's reply to a Japanese phrase (or to none), and in any session a reply to a phrase
  // in Japanese, must be in Japanese - a Russian session answered «それはなんですか?» in Russian
  const userJa = JAPANESE.test(userText);
  if ((userJa || (lang === 'ja' && !userText)) && botText.replace(/konnichiwa/gi, '').trim().length > 12
      && !JAPANESE.test(botText)) {
    return userJa ? 'гость спросил по-японски — повтори то же самое по-японски.' : 'ответ прозвучал не по-японски. Повтори то же самое по-японски.';
  }
  if (userText && lang === 'auto' && cyrLang(userText) && cyrLang(botText) && cyrLang(userText) !== cyrLang(botText)) {
    const want = cyrLang(userText) === 'ru' ? 'по-русски' : 'по-кыргызски';
    return `гость сказал это ${want} — ответь на его языке: повтори то же самое ${want}.`;
  }
  if ((lang === 'ru' || lang === 'auto') && isRussianText(botText) && MIXED_RU.test(botText)) {
    return 'в русском ответе кыргызские слова. Повтори то же самое целиком по-русски, числа русскими словами.';
  }
  return null;
}
