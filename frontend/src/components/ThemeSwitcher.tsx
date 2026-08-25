import { useTheme } from "../theme";
import type { Theme } from "../theme";
import { useT } from "../i18n";
import type { TranslationKey } from "../i18n";

// Segmented ☀ / 🌙 control in the header, mirroring the language switcher.
const OPTIONS: { value: Theme; icon: string; labelKey: TranslationKey }[] = [
  { value: "light", icon: "☀", labelKey: "theme.light" },
  { value: "dark", icon: "🌙", labelKey: "theme.dark" },
];

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { t } = useT();
  return (
    <div className="theme-switch" role="group" aria-label={t("theme.label")}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={theme === o.value ? "active" : ""}
          onClick={() => setTheme(o.value)}
          title={t(o.labelKey)}
          aria-pressed={theme === o.value}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
