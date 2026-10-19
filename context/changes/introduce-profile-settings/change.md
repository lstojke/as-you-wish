---
change_id: introduce-profile-settings
title: Adding private profile settings and important dates
status: implementing
created: 2026-10-19
updated: 2026-10-19
archived_at: null
---

## Notes

To profile placeholder add actual content. During registration process require username. In the settings apart from currency add language preference selection, name, surname and important dates (suggest for example birthday or anniveraries) - important date entity should contain date, heading and description. username and email address are the only compulsory fields.

### Planning decisions (2026-10-19)

The original username requirement was explicitly withdrawn: retain email/password authentication and optional first/last names, without usernames or account backfill. Extend the existing settings page, personalize the owner's header, and keep names/dates private.

Important dates have a required full date and heading, optional description, and Off/Weekly/Monthly/Yearly repetition (Yearly by default). Missing corresponding days fall back to the last valid day of the intended month without changing the original anchor. This change stores and displays the recurrence contract; reminder delivery is a separate future feature, `notifications-introduction`.

Use separate profile/preferences saves and independent date CRUD. Block preference save while other sections have unsaved changes. See [plan brief](./plan-brief.md) and [implementation plan](./plan.md) for the approved scope.
