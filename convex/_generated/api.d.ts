/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountErasure from "../accountErasure.js";
import type * as admin from "../admin.js";
import type * as adminProfile from "../adminProfile.js";
import type * as adminProfileRepair from "../adminProfileRepair.js";
import type * as analytics from "../analytics.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as authIdentity from "../authIdentity.js";
import type * as bootstrap from "../bootstrap.js";
import type * as cardClaims from "../cardClaims.js";
import type * as cards from "../cards.js";
import type * as components_ from "../components.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as demo from "../demo.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as links from "../links.js";
import type * as profileAccess from "../profileAccess.js";
import type * as profileImageCleanup from "../profileImageCleanup.js";
import type * as profileImageProcessing from "../profileImageProcessing.js";
import type * as profileImageUploadHttp from "../profileImageUploadHttp.js";
import type * as profileImages from "../profileImages.js";
import type * as profileMedia from "../profileMedia.js";
import type * as profileMediaCleanup from "../profileMediaCleanup.js";
import type * as profileMediaProcessing from "../profileMediaProcessing.js";
import type * as profileMediaUploadHttp from "../profileMediaUploadHttp.js";
import type * as profileProjection from "../profileProjection.js";
import type * as profileSlug from "../profileSlug.js";
import type * as profiles from "../profiles.js";
import type * as retention from "../retention.js";
import type * as settings from "../settings.js";
import type * as storage from "../storage.js";
import type * as uploadErrors from "../uploadErrors.js";
import type * as uploadPolicies from "../uploadPolicies.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountErasure: typeof accountErasure;
  admin: typeof admin;
  adminProfile: typeof adminProfile;
  adminProfileRepair: typeof adminProfileRepair;
  analytics: typeof analytics;
  audit: typeof audit;
  auth: typeof auth;
  authIdentity: typeof authIdentity;
  bootstrap: typeof bootstrap;
  cardClaims: typeof cardClaims;
  cards: typeof cards;
  components: typeof components_;
  crons: typeof crons;
  customers: typeof customers;
  demo: typeof demo;
  http: typeof http;
  invitations: typeof invitations;
  links: typeof links;
  profileAccess: typeof profileAccess;
  profileImageCleanup: typeof profileImageCleanup;
  profileImageProcessing: typeof profileImageProcessing;
  profileImageUploadHttp: typeof profileImageUploadHttp;
  profileImages: typeof profileImages;
  profileMedia: typeof profileMedia;
  profileMediaCleanup: typeof profileMediaCleanup;
  profileMediaProcessing: typeof profileMediaProcessing;
  profileMediaUploadHttp: typeof profileMediaUploadHttp;
  profileProjection: typeof profileProjection;
  profileSlug: typeof profileSlug;
  profiles: typeof profiles;
  retention: typeof retention;
  settings: typeof settings;
  storage: typeof storage;
  uploadErrors: typeof uploadErrors;
  uploadPolicies: typeof uploadPolicies;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
