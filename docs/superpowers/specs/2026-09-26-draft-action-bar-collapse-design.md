# Collapsible draft action bar

## Status

Approved interaction design based on the requested profile-workspace behavior.

## Summary

The shared profile-workspace action bar should stay prominent while a draft has
unsaved changes, is being saved or published, or needs the user to inspect its
actions. Once the draft is saved and idle, the bar should collapse into a
compact bottom control so it does not permanently occupy the workspace.

## Behavior

- The expanded bar keeps the existing Draft changes/status text, Save draft
  button, and Publish button.
- A dirty draft automatically expands the bar.
- Save and publish operations keep the bar expanded until the operation
  settles.
- An idle, saved draft automatically collapses the bar.
- The collapsed control shows the current saved status and an affordance to
  expand the action bar. It exposes `aria-expanded` and controls the expanded
  action region.
- Activating the collapsed control expands the bar. The user can collapse it
  again without changing the draft.
- Existing disabled, loading, validation, navigation-save, and publication
  behavior remains unchanged.

## Component boundary

`ProfileWorkspaceFrame` owns the local expanded/collapsed presentation state.
The profile editor supplies an explicit `hasDraftChanges` value instead of
making the frame infer dirtiness from `saveDisabled`, since save can also be
disabled during image or media processing.

The frame uses the same action bar for `/app/profile` and `/app/customize`.
The links workspace remains behaviorally unchanged in this slice.

## Accessibility and motion

- The collapsed trigger is a semantic button with a useful accessible name,
  `aria-expanded`, and `aria-controls`.
- Keyboard activation works through the button's native interaction.
- Focus remains visible using the existing Tapit focus tokens.
- Collapse/expand may use a short height/opacity transition, but reduced-motion
  users receive an immediate state change.
- The fixed bar continues to reserve bottom space so it does not cover form
  controls on mobile.

## Verification

- Unit coverage verifies automatic expansion for dirty/loading states,
  collapse after save, and keyboard expansion from the collapsed control.
- Customer E2E coverage verifies the clean collapsed state and the expanded
  state after editing on both profile workspace routes.
- Existing profile editor, accessibility, focus, and full demo E2E suites
  remain green.
