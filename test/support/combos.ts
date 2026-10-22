import {
  ADAPTERS,
  ADDONS,
  type AddonName,
  addonsFor,
  type ScaffoldOptions,
  type TemplateName,
} from "../../src/options";

/** Every subset of the add-ons, for every template (and the router switch of the single-page app). */
export function allCombos(): ScaffoldOptions[] {
  const names: AddonName[] = ADDONS.map((addon) => addon.name);
  const out: ScaffoldOptions[] = [];
  for (const template of ["spa", "dusk"] as TemplateName[]) {
    for (let mask = 0; mask < 1 << names.length; mask += 1) {
      const options: ScaffoldOptions = { name: "demo", template };
      names.forEach((name, index) => {
        options[name] = (mask & (1 << index)) !== 0;
      });
      out.push(options);
      if (template === "spa" && mask % 7 === 0) out.push({ ...options, router: true });
    }
  }
  // A starter builds some add-ons in: every subset of the ones it offers.
  for (const template of ["content", "dashboard", "api"] as TemplateName[]) {
    const offered = addonsFor(template).map((addon) => addon.name);
    for (let mask = 0; mask < 1 << offered.length; mask += 1) {
      const options: ScaffoldOptions = { name: "demo", template };
      offered.forEach((name, index) => {
        options[name] = (mask & (1 << index)) !== 0;
      });
      out.push(options);
    }
  }
  // Every deployment target, with no add-ons and with all of them (the generated config and scripts
  // differ per target, so each one is checked like the Node layout).
  for (const adapter of ADAPTERS) {
    out.push({ name: "demo", template: "dusk", adapter });
    const all: ScaffoldOptions = { name: "demo", template: "dusk", adapter };
    for (const name of names) all[name] = true;
    out.push(all);
  }
  return out;
}

/** A readable label for a failing combination. */
export function label(options: ScaffoldOptions): string {
  const on = ADDONS.filter((addon) => options[addon.name] === true).map((addon) => addon.name);
  const target = options.adapter === undefined ? "" : `+${options.adapter}`;
  return `${options.template ?? "spa"}${target}${options.router === true ? "+router" : ""}:${on.join("+") || "plain"}`;
}

/** A packed manifest for every ShadowJS package, with absolute tarball paths under `/pack`. */
export function fullManifest(): { packages: { name: string; version: string; tarball: string }[] } {
  const names = [
    "core",
    "compiler",
    "web",
    "vite",
    "router",
    "query",
    "dusk",
    "testing",
    "convex",
    "clerk",
    "devtools",
    "eslint-plugin",
    "primitives",
    "ui",
  ];
  return {
    packages: names.map((name) => ({
      name: `@shadow-js/${name}`,
      version: "1.0.0",
      tarball: `/pack/shadow-js-${name}-1.0.0.tgz`,
    })),
  };
}
