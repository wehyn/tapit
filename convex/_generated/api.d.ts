/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as bootstrap from "../bootstrap.js";
import type * as cardClaims from "../cardClaims.js";
import type * as cards from "../cards.js";
import type * as customers from "../customers.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as links from "../links.js";
import type * as profileAccess from "../profileAccess.js";
import type * as profileImages from "../profileImages.js";
import type * as profileProjection from "../profileProjection.js";
import type * as profiles from "../profiles.js";
import type * as settings from "../settings.js";
import type * as storage from "../storage.js";
import type * as validators from "../validators.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  analytics: typeof analytics;
  audit: typeof audit;
  auth: typeof auth;
  authEmail: typeof authEmail;
  bootstrap: typeof bootstrap;
  cardClaims: typeof cardClaims;
  cards: typeof cards;
  customers: typeof customers;
  http: typeof http;
  invitations: typeof invitations;
  links: typeof links;
  profileAccess: typeof profileAccess;
  profileImages: typeof profileImages;
  profileProjection: typeof profileProjection;
  profiles: typeof profiles;
  settings: typeof settings;
  storage: typeof storage;
  validators: typeof validators;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
