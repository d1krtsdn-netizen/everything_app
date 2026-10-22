// Maps form values ⇄ database rows.
// Keys in COLUMNS are real table columns; every other field key is stored in items.data (JSON).
export const COLUMNS = ['title', 'status', 'due_at', 'remind_at'];

export function defaults(type) {
  const v = {};
  for (const f of type.fields) if (f.default !== undefined) v[f.key] = f.default;
  return v;
}

export const valueOf = (item, key) => (COLUMNS.includes(key) ? item?.[key] : item?.data?.[key]);

export function toRow(values, base = {}) {
  const row = { data: { ...(base.data || {}) } };
  for (const [k, v] of Object.entries(values)) {
    if (COLUMNS.includes(k)) row[k] = v === '' ? null : v;
    else row.data[k] = v;
  }
  return row;
}

// Builds a new item row for a space with the type's defaults.
export function newItem(space, type, values) {
  return { space_id: space.id, status: type.defaultStatus ?? null, ...toRow({ ...defaults(type), ...values }) };
}

// Reusable reminder field with "before the date" shortcuts
export const reminderField = (from = 'due_at') => ({
  key: 'remind_at', label: 'Remind me (push notification)', type: 'datetime',
  presets: [
    { label: '1 hour before', minutes: 60, from },
    { label: '1 day before', minutes: 1440, from },
    { label: '1 week before', minutes: 10080, from },
  ],
});
