// Starter searches offered on the "new search" page.
import { EMPTY_FILTERS, type Filters } from "./match";

export interface Preset {
  key: string;
  name: string;
  filters: Filters;
}

const f = (o: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...o });

export const PRESETS: Preset[] = [
  {
    key: "entry-research",
    name: "Entry-level research",
    filters: f({ skillSet: ["Research"], experience: ["Entry-level", "Junior (1–4 years experience)"] }),
  },
  { key: "remote-eng", name: "Remote engineering", filters: f({ skillSet: ["Software engineering"], workLocation: ["Remote"] }) },
  {
    key: "policy-europe",
    name: "Policy in Europe",
    filters: f({
      skillSet: ["Policy"],
      countries: ["UK", "Europe", "Belgium", "France", "Germany", "Netherlands", "Switzerland"],
    }),
  },
  { key: "infosec", name: "Security", filters: f({ skillSet: ["Information security"] }) },
  { key: "ops", name: "Ops & strategy", filters: f({ skillSet: ["Operations", "Strategy", "Management"] }) },
  { key: "internships", name: "Internships", filters: f({ roleType: ["Internship"] }) },
];

export function presetByKey(key: string | null): Preset | undefined {
  return PRESETS.find((p) => p.key === key);
}
