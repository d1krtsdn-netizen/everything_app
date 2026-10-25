// CATEGORY TYPE REGISTRY
// To add a new type: create js/types/<name>.js (copy list.js) and add it below. No database change needed.
import events from './events.js';
import todo from './todo.js';
import shopping from './shopping.js';
import bills from './bills.js';
import list from './list.js';

export const TYPES = Object.fromEntries([events, todo, shopping, bills, list].map((t) => [t.id, t]));
export const getType = (id) => TYPES[id] || TYPES.list;
export const typeList = () => Object.values(TYPES);

// Created automatically the first time a user signs in
export const STARTER_SPACES = [
  { name: 'Events', type: 'events', icon: 'icons/list_icons/Ticket_Voucher.svg' },
  { name: 'To-Do', type: 'todo', icon: 'icons/list_icons/List_Checklist.svg' },
  { name: 'To-Buy', type: 'shopping', icon: 'icons/list_icons/Shopping_Bag_02.svg' },
];
