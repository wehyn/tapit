# Profile Slideshow Image Limit

**Issue:** [#139](https://github.com/wehyn/tapit/issues/139)  
**Related design:** [Profile Slideshow Upload Queue and Order Controls](2026-10-13-profile-slideshow-upload-queue-and-order-controls-design.md)  
**Date:** 2026-10-28  
**Status:** Draft for review

## Goal

Reduce the maximum number of images in a profile slideshow from 10 to 5. Make the limit clear in the editor and enforce it when saving, without silently removing images already stored on profiles.

## Existing behavior

The limit is shared by the slideshow editor, its upload queue, and profile media validation. The editor already displays the current image count and disables adding images at the limit. Media normalization also stops after the configured maximum, so lowering the shared value without changing read behavior could hide existing slides beyond the fifth image.

## Behavior

- A slideshow may contain at most 5 images when a draft is saved or published.
- The count includes uploaded images and all pending, uploading, and failed queue items. The sixth image cannot be queued, including when selected in a multi-file upload.
- The editor shows the count against 5 and explains when no more images can be added. The add controls are disabled at capacity.
- Client validation provides immediate feedback. Convex validation enforces the same limit at the save boundary; local-demo saves follow the same rule.
- Saving or publishing a slideshow with more than 5 images fails with a clear message. The failed operation makes no partial profile or storage-reference changes.

## Existing profiles with more than 5 images

- Loading, normalizing, editing, previewing, and publicly displaying an existing slideshow must preserve all its images and their order. The new limit must not truncate data on read or render.
- The editor displays every existing image and indicates that the slideshow is over the limit, including how many images the customer must remove before saving.
- Adding images is disabled while the slideshow has 5 or more images. Customers may explicitly remove images; they may save or publish once the slideshow contains at most 5.
- Until the customer removes enough images, any draft save or publish request that includes the over-limit slideshow is rejected. The editor explains this before submission so the customer knows that the slideshow needs trimming.
- A rejected save leaves the existing draft, published profile, and asset references intact. After an explicit removal is saved, existing media-reference cleanup applies; no asset is removed merely because the limit changed.

No data migration is required. Existing published profiles continue to display their saved slides until the customer explicitly changes and publishes the slideshow.

## Scope

- Apply the new limit consistently to the local demo and Convex modes.
- Preserve the current upload queue, ordering, image validation, publication, and storage ownership behavior.
- Do not change background-image limits, accepted file types, image dimensions, storage format, or the profile schema.

## Implementation responsibilities

- Keep the 5-image cap in editor capacity checks and shared media validation, with matching validation copy.
- Enforce the cap in Convex draft-save and publish validation, as well as the local-demo save path.
- Separate read-time media normalization from the new save limit so existing over-limit slideshows remain intact until users explicitly remove images.
- Show an accessible over-limit message and associate it with the slideshow controls and save feedback.

## Acceptance criteria

- The editor clearly shows “x of 5” and prevents adding a sixth image across single-file, multi-file, and queued uploads.
- Both local-demo and Convex saves reject a slideshow with more than 5 images and report the issue without changing saved profile data or asset references.
- An existing profile with more than 5 images retains every image, in order, when loaded, previewed, and displayed publicly.
- For an over-limit existing profile, the editor shows all slides, blocks additions, and explains how many slides must be removed before saving.
- Explicitly removing enough slides allows saving or publishing the remaining slides; storage cleanup follows the existing reference policy only after that save succeeds.
- Slideshow validation and editor copy use the new limit consistently.

## Verification plan

Cover the fifth and sixth image through the editor, multi-file selection, pending queue states, local-demo saves, and Convex draft-save and publish paths. Include an existing profile with more than 5 slides and confirm that opening, previewing, and rendering it preserves all slides; an over-limit save is rejected without data loss; and explicitly removing enough slides allows the save and normal reference cleanup.
