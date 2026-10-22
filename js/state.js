// App-wide state (signed-in user, profile, categories) and permission helpers.
export const state = { user: null, profile: null, spaces: [] };

export function myRole(space) {
  const m = space?.space_members?.find((x) => x.user_id === state.user?.id);
  return m?.role || (space?.owner_id === state.user?.id ? 'owner' : 'viewer');
}
export const canEdit = (space) => myRole(space) !== 'viewer';
