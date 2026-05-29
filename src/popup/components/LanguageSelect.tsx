import { Dropdown } from "./Dropdown";
import { LANGUAGES } from "../../languages";

interface LanguageSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowAuto?: boolean;
}

export function LanguageSelect({ label, value, onChange, allowAuto }: LanguageSelectProps) {
  const options = (allowAuto ? LANGUAGES : LANGUAGES.filter((l) => l.code !== "auto")).map(
    (lang) => ({
      value: lang.code,
      label: lang.native,
      description: lang.name
    })
  );

  return (
    <div className="surface-card flex flex-col gap-1 p-2.5">
      <span className="section-label">{label}</span>
      <Dropdown value={value} options={options} onChange={onChange} />
    </div>
  );
}
