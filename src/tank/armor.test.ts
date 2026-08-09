import { describe, expect, it } from "vitest";
import { ARMOR_FACET_IDS, ARMOR_PROFILES } from "./armor";

describe("armor profiles", () => {
  it("defines a positive thickness for every explicit armor facet", () => {
    for (const profile of Object.values(ARMOR_PROFILES)) {
      for (const facetId of ARMOR_FACET_IDS) {
        expect(profile.thicknessByFacet[facetId]).toBeGreaterThan(0);
      }
    }
  });

  it("makes the brawler front-heavy and the allrounder more balanced", () => {
    const brawler = ARMOR_PROFILES.BRAWLER.thicknessByFacet;
    const allrounder = ARMOR_PROFILES.ALLROUNDER.thicknessByFacet;

    expect(brawler.FRONT).toBeGreaterThan(allrounder.FRONT);
    expect(brawler.LEFT_SIDE).toBeLessThan(allrounder.LEFT_SIDE);
    expect(brawler.RIGHT_SIDE).toBeLessThan(allrounder.RIGHT_SIDE);
  });
});
