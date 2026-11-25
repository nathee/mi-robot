import { afterEach, describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { th } from "../i18n/th";
import { detectLocale, setCurrentLocale, t, translate, type MessageKey } from "../i18n";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n dictionaries", () => {
  afterEach(() => setCurrentLocale("en"));

  it("th defines exactly the keys of en, none empty", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(th)) expect(v.trim(), k).not.toBe("");
  });

  it("th uses the same {placeholders} as en", () => {
    for (const k of Object.keys(en) as MessageKey[]) {
      expect(placeholders(th[k]), k).toEqual(placeholders(en[k]));
    }
  });

  it("translate interpolates and t() follows the current locale", () => {
    expect(translate("en", "toolbar.homeTitle", { joints: "0, 0" })).toBe("Return robot to Home position (0, 0)");
    expect(translate("th", "toolbar.home")).toBe(th["toolbar.home"]);
    expect(t("toolbar.home")).toBe("Home");
    setCurrentLocale("th");
    expect(t("toolbar.home")).toBe(th["toolbar.home"]);
  });

  it("leaves unknown placeholders intact", () => {
    expect(translate("en", "toolbar.homeTitle")).toBe("Return robot to Home position ({joints})");
  });

  it("detectLocale prefers saved value, then browser language", () => {
    expect(detectLocale("en", "th-TH")).toBe("en");
    expect(detectLocale(null, "th-TH")).toBe("th");
    expect(detectLocale(null, "en-US")).toBe("en");
    expect(detectLocale("xx", undefined)).toBe("en");
  });
});
