import { useT } from "../i18n";
import type { Lang } from "../i18n";

// Segmented EN / हिं control shown in the header. Kept tiny and always visible so
// the language choice is one tap away in both the command center and citizen app.
const OPTIONS: { code: Lang; short: string; full: string }[] = [
  { code: "en", short: "EN", full: "English" },
  { code: "hi", short: "हिं", full: "हिन्दी" },
];

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useT();
  return (
    <div className="lang-switch" role="group" aria-label={t("lang.label")}>
      {OPTIONS.map((o) => (
        <button
          key={o.code}
          type="button"
          className={lang === o.code ? "active" : ""}
          onClick={() => setLang(o.code)}
          title={o.full}
          aria-pressed={lang === o.code}
        >
          {o.short}
        </button>
      ))}
    </div>
  );
}
