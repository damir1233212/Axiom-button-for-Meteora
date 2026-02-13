# Chrome Web Store Publishing Checklist

## 1) Prepare Release

- Update `manifest.json`:
  - `name`
  - `description`
  - `version`
- Confirm icon files exist and are valid:
  - `icons/icon16.png`
  - `icons/icon32.png`
  - `icons/icon48.png`
  - `icons/icon128.png`
- Ensure all user-facing text is in English.
- Verify no debug-only code or temporary logs remain.

## 2) Validate Permissions

- Keep permissions minimal and justified:
  - `storage`
  - `windows`
- Keep host permissions limited to required domains only.

## 3) Test Before Packaging

- Load unpacked extension and run manual checks from `docs/manual-test-checklist.md`.
- Verify no duplicate popup windows on repeated button clicks.
- Verify extension behavior on SPA navigation.
- Verify console has no extension-thrown uncaught errors.

## 4) Package

- Create a ZIP of extension files for submission.
- Exclude local-only artifacts and VCS metadata (for example `.git/`).

## 5) Chrome Web Store Listing

- Provide:
  - clear English description
  - screenshots
  - category
  - privacy policy URL/content
- If required, include support contact details.

## 6) Submit and Monitor

- Submit for review.
- Track review feedback and policy warnings.
- Increment `version` for each update submission.

