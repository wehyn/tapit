# Ignore Environment-Specific `.env` Files

Date: 2026-10-31
Status: Approved

## Goal

Prevent environment-specific `.env.*` files from being staged accidentally while keeping the repository's `.env.example` available as the tracked setup template.

## Current behavior

The root `.gitignore` ignores `.env` and `.env*.local`. It does not ignore names such as `.env.production` or `.env.development`. `.env.example` is tracked and the README uses it to create `.env.local`.

## Design

Add `.env.*` and then `!.env.example` to the existing local environment rules. Git's slashless patterns apply at any directory depth, so this covers nested environment files too. Keep the existing `.env` and `.env*.local` rules.

The only exception is `.env.example`. All other `.env.<suffix>` files are ignored, including production, development, staging, test, and nested variants.

## Scope

- Change only `.gitignore`.
- Do not add tests or change application behavior, environment defaults, or `.env.example` contents.

## Verification

- `git check-ignore -v .env.production .env.development .env.staging` reports the new rule.
- `git check-ignore --no-index -v .env.example` reports no matching ignore rule.
- `git ls-files --error-unmatch .env.example` confirms the example remains tracked.
