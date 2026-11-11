export type { ListGroup as PersonalListGroup, ListGroupMembership } from "@/lib/services/list-groups";

export function groupHref(groupId: string) {
  return `/dashboard?group=${encodeURIComponent(groupId)}`;
}
