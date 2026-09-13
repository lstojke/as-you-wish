# Follow-up: Owner toggle to hide reservation badges ("gift-surprise mode")

> Seeded during planning of `view-shared-list` (S-04). Not part of that slice.

## Idea

In S-04, per-item **Available / Reserved** badges are shown to **everyone**, including the list owner. Some owners prefer not to know which of their items are already claimed, to preserve the surprise. Give the owner a per-list (or per-profile) setting to **hide reservation badges** on lists they own.

## Motivation

- PRD's gift-surprise intent (owner sees aggregate only, FR-014) suggests owners may not want per-item reservation signals.
- S-04 deliberately shipped full visibility first (simpler, one render path); this follow-up adds the opt-out without blocking S-04.

## Rough surface

- **Setting storage**: a boolean like `hide_reservation_status` on the list (or on the user profile as a global default). Migration + RLS if list-scoped.
- **Read path**: `[id].astro` / `ListDetail` skip passing `reservedItemIds` (or pass empty) when the owner has hidden badges *and* the current viewer is the owner. Invitees are unaffected — they always see status.
- **UI**: a toggle in the owner's list actions (or profile settings) to flip the flag.
- **Interaction with FR-014**: if the owner-aggregate count ships, decide whether hiding badges also hides/affects the count.

## Notes

- Keep the invitee experience unchanged — this only affects what the **owner** sees on their **own** lists.
- Consider defaulting to "show" (current S-04 behavior) so existing owners see no change until they opt in.
