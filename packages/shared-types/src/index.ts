// Public surface of @mirra/shared-types.
//
// `api.gen.ts` and `taxonomy.gen.ts` are generated from the backend (`pnpm gen:api`); CI fails
// when they are stale. This file only adds friendly aliases and typed views over them.
import type { components, operations, paths } from "./api.gen";
import { taxonomyData } from "./taxonomy.gen";

export type { components, operations, paths };

type Schemas = components["schemas"];

export type ErrorResponse = Schemas["ErrorResponse"];
export type UserOut = Schemas["UserOut"];
export type TokenResponse = Schemas["TokenResponse"];
export type Preferences = Schemas["Preferences"];
export type RenderQuality = Schemas["RenderQuality"];
export type MarketplaceInfo = Schemas["MarketplaceInfo"];
export type ConnectorCapabilities = Schemas["ConnectorCapabilities"];
export type MarketplaceStatus = Schemas["MarketplaceStatus"];
export type Money = Schemas["Money"];
export type NormalizedListing = Schemas["NormalizedListing"];
export type LandedCost = Schemas["LandedCost"];
export type CostComponent = Schemas["CostComponent"];
export type SearchResult = Schemas["SearchResult"];
export type SearchResponse = Schemas["SearchResponse"];
export type MarketplaceSearchStatus = Schemas["MarketplaceSearchStatus"];
export type Authenticity = Schemas["Authenticity"];
export type ListingDetail = Schemas["ListingDetail"];
export type ListingSummary = Schemas["ListingSummary"];
export type Alternative = Schemas["Alternative"];
export type AlternativesResponse = Schemas["AlternativesResponse"];
export type PricePoint = Schemas["PricePoint"];
export type SavedItem = Schemas["SavedItem"];
export type ShoppingHistory = Schemas["ShoppingHistory"];
export type OutfitOut = Schemas["OutfitOut"];
export type OutfitItemOut = Schemas["OutfitItemOut"];
export type OutfitIn = Schemas["OutfitIn"];
export type PurchaseRoute = Schemas["PurchaseRoute"];
export type LinkResolution = Schemas["LinkResolution"];
export type SizeGuide = Schemas["SizeGuide"];
export type SizeReading = Schemas["SizeReading"];
export type SizeAdvice = Schemas["SizeAdvice"];
export type SizeAdviceRequest = Schemas["SizeAdviceRequest"];
export type Measurements = Schemas["Measurements"];

type TaxonomyData = typeof taxonomyData;

export type Category = TaxonomyData["categories"][number]["id"];
export type CategoryGroup = TaxonomyData["groups"][number];
export type BodyRegion = TaxonomyData["bodyRegions"][number];
export type LayerName = keyof TaxonomyData["layers"];

export interface CategorySpec {
  id: Category;
  label: string;
  group: CategoryGroup;
  bodyRegion: BodyRegion;
  defaultLayer: number;
}

export interface Taxonomy {
  categories: readonly CategorySpec[];
  groups: readonly CategoryGroup[];
  bodyRegions: readonly BodyRegion[];
  fullBodyCovers: readonly BodyRegion[];
  layers: Readonly<Record<LayerName, number>>;
}

/** The fashion taxonomy exported by the backend (`mirra.core.taxonomy`). */
export const taxonomy: Taxonomy = taxonomyData;

const byId = new Map<Category, CategorySpec>(taxonomy.categories.map((c) => [c.id, c]));

export function categorySpec(id: Category): CategorySpec {
  const spec = byId.get(id);
  if (!spec) throw new Error(`Unknown category: ${id}`);
  return spec;
}

export function isCategory(value: string): value is Category {
  return byId.has(value as Category);
}
