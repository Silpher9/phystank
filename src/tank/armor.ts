export const ARMOR_FACET_IDS = [
  "FRONT",
  "LEFT_SIDE",
  "RIGHT_SIDE",
  "REAR",
  "TURRET_FRONT",
  "ROOF",
] as const;

export type ArmorFacetId = (typeof ARMOR_FACET_IDS)[number];

export type ArmorProfile = Readonly<{
  id: "BRAWLER" | "ALLROUNDER";
  label: string;
  thicknessByFacet: Readonly<Record<ArmorFacetId, number>>;
}>;

/**
 * Gameplay data only. Geometry lives in tank.ts so armor tuning never requires
 * changes to the mesh layout.
 */
export const ARMOR_PROFILES = {
  BRAWLER: {
    id: "BRAWLER",
    label: "Brawler",
    thicknessByFacet: {
      FRONT: 160,
      LEFT_SIDE: 45,
      RIGHT_SIDE: 45,
      REAR: 35,
      TURRET_FRONT: 140,
      ROOF: 20,
    },
  },
  ALLROUNDER: {
    id: "ALLROUNDER",
    label: "Allrounder",
    thicknessByFacet: {
      FRONT: 100,
      LEFT_SIDE: 80,
      RIGHT_SIDE: 80,
      REAR: 70,
      TURRET_FRONT: 95,
      ROOF: 25,
    },
  },
} as const satisfies Readonly<Record<ArmorProfile["id"], ArmorProfile>>;

export type ArmorProfileId = keyof typeof ARMOR_PROFILES;
