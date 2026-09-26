# Collapsible draft action bar

## Status

Approved interaction design based on the requested profile-workspace behavior.

## Summary

The shared profile-workspace action bar should appear only while there are
unsaved or unpublished draft changes, or while a save/publish operation is in
flight. A clean, published workspace should not reserve space for or render a
fixed bottom bar.

## Behavior

- The expanded bar keeps the existing Draft changes/status text, Save draft
  button, and Publish button.
- A dirty or unpublished draft renders the complete fixed bar immediately.
- Save and publish operations keep the complete bar visible until the
  operation settles.
- Once the profile is clean and fully published, the entire fixed wrapper,
  including its border, shadow, padding, and action region, is removed.
- There is no compact saved-status trigger or separate manual collapse state.
- Existing disabled, loading, validation, navigation-save, and publication
  behavior remains unchanged.

## Component boundary

`ProfileWorkspaceFrame` owns only the visibility of the fixed action bar. The
profile editor supplies an explicit `hasDraftChanges` value that includes both
unsaved draft edits and differences from the last published snapshot, instead
of making the frame infer dirtiness from `saveDisabled`, since save can also be
disabled during image or media processing.

The frame uses the same action bar for `/app/profile` and `/app/customize`.
The links workspace remains behaviorally unchanged in this slice.

## Accessibility and motion

- The complete action bar uses a labeled semantic region while it is present.
- Save and Publish retain their native keyboard behavior and existing visible
  focus treatment.
- The fixed bar reserves bottom space only while it is present, so a clean
  workspace does not retain an empty mobile gap.

## Verification

- Unit coverage verifies publishing and media interactions with the conditional
  action bar in both profile editor branches.
- Customer E2E coverage verifies that the full bar is absent when clean and
  appears after editing on both profile workspace routes.
- Existing profile editor, accessibility, focus, and full demo E2E suites
  remain green.
