// TO-BUY – shopping list grouped by category; bought items can be re-added with one tap.
import { h } from '../lib/dom.js';
import { checkCircle, linkOut, reminderBadge } from '../views/card.js';

const CATEGORIES = ['Groceries', 'Household', 'Electronics', 'Clothing', 'Health & beauty', 'Gifts', 'Other'];
const GROCERY_SUBCATEGORIES = [
  'Fruit', 'Vegetables', 'Bakery', 'Meat & poultry', 'Fish & seafood', 'Dairy & eggs',
  'Pantry', 'Breakfast', 'Snacks & confectionery', 'Drinks', 'Frozen', 'Herbs & spices',
  'Cleaning supplies', 'Laundry', 'Kitchen & household', 'Personal care', 'Other groceries',
];
const GROCERY_RULES = [
  ['Fruit', '🍎', ['apple', 'apples', 'banana', 'bananas', 'blueberr', 'blackberr', 'raspberr', 'strawberr', 'berry', 'berries', 'grape', 'grapes', 'orange', 'oranges', 'lemon', 'lime', 'pear', 'peach', 'plum', 'mango', 'pineapple', 'melon', 'watermelon', 'kiwi', 'avocado', 'cherry', 'cherries', 'coconut', 'fruit']],
  ['Vegetables', '🥦', ['vegetable', 'veg', 'carrot', 'carrots', 'potato', 'potatoes', 'tomato', 'tomatoes', 'onion', 'onions', 'garlic', 'lettuce', 'spinach', 'cucumber', 'pepper', 'peppers', 'broccoli', 'cauliflower', 'courgette', 'aubergine', 'mushroom', 'mushrooms', 'cabbage', 'kale', 'celery', 'sweetcorn', 'corn', 'beansprout', 'asparagus', 'peas', 'pumpkin', 'ginger']],
  ['Bakery', '🍞', ['bread', 'bagel', 'bagels', 'croissant', 'croissants', 'bun', 'buns', 'roll', 'rolls', 'baguette', 'sourdough', 'pitta', 'pita', 'wrap', 'wraps', 'tortilla', 'muffin', 'muffins', 'cake', 'cakes', 'pastry', 'pastries', 'bakery', 'crumpet', 'crumpets']],
  ['Meat & poultry', '🍗', ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'bacon', 'sausage', 'sausages', 'ham', 'steak', 'mince', 'meat', 'chorizo']],
  ['Fish & seafood', '🐟', ['fish', 'salmon', 'tuna', 'prawn', 'prawns', 'shrimp', 'cod', 'haddock', 'trout', 'sardine', 'mackerel', 'seafood', 'crab', 'mussel', 'oyster', 'anchovy']],
  ['Dairy & eggs', '🥛', ['milk', 'cheese', 'butter', 'yoghurt', 'yogurt', 'cream', 'egg', 'eggs', 'custard', 'fromage', 'dairy']],
  ['Breakfast', '🥣', ['cereal', 'porridge', 'oats', 'granola', 'muesli', 'breakfast', 'pancake', 'pancakes', 'maple syrup']],
  ['Snacks & confectionery', '🍫', ['chocolate', 'crisps', 'crisp', 'sweets', 'candy', 'biscuit', 'biscuits', 'cookie', 'cookies', 'snack', 'snacks', 'popcorn', 'nuts', 'peanuts', 'cracker', 'crackers', 'sweet']],
  ['Drinks', '🥤', ['water', 'juice', 'coffee', 'tea', 'cola', 'soda', 'lemonade', 'drink', 'drinks', 'beer', 'wine', 'milkshake', 'smoothie']],
  ['Frozen', '🧊', ['frozen', 'ice cream', 'ice loll', 'fish finger', 'fish fingers', 'pizza', 'oven chips']],
  ['Herbs & spices', '🌿', ['herb', 'basil', 'parsley', 'coriander', 'mint', 'thyme', 'rosemary', 'spice', 'spices', 'cumin', 'paprika', 'turmeric', 'cinnamon', 'chilli', 'chili']],
  ['Cleaning supplies', '🧽', ['cleaner', 'cleaning', 'washing up liquid', 'dish soap', 'washing-up', 'detergent', 'bleach', 'disinfectant', 'sponge', 'sponges', 'bin bag', 'bin bags', 'rubbish bag', 'rubbish bags', 'surface spray', 'toilet cleaner']],
  ['Laundry', '🧺', ['laundry', 'washing powder', 'fabric softener', 'stain remover', 'laundry detergent']],
  ['Kitchen & household', '🧻', ['kitchen roll', 'paper towel', 'paper towels', 'toilet roll', 'toilet paper', 'cling film', 'foil', 'baking paper', 'matches', 'light bulb', 'batteries']],
  ['Personal care', '🧴', ['shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'soap', 'deodorant', 'shower gel', 'floss', 'razor', 'tissue', 'tissues', 'toiletries']],
  ['Pantry', '🥫', ['rice', 'pasta', 'noodle', 'noodles', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'soup', 'tin', 'tinned', 'beans', 'lentil', 'lentils', 'chickpea', 'chickpeas', 'stock', 'honey', 'jam', 'peanut butter', 'spread', 'passata', 'coconut milk', 'cooking']],
];
const MAIN_CATEGORY_RULES = [
  ['Electronics', '📱', ['phone charger', 'charger', 'headphone', 'headphones', 'earbuds', 'cable', 'adapter', 'electronics']],
  ['Clothing', '👕', ['sock', 'socks', 'shirt', 'trousers', 'jeans', 'coat', 'jacket', 'clothing', 'shoes']],
  ['Health & beauty', '🧴', ['shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'soap', 'deodorant', 'skincare', 'makeup', 'vitamin', 'vitamins', 'medicine']],
  ['Household', '🧽', ['cleaner', 'cleaning', 'detergent', 'bleach', 'sponge', 'bin bag', 'toilet roll', 'kitchen roll', 'washing powder', 'fabric softener']],
  ['Gifts', '🎁', ['gift', 'present']],
];
const GENERIC_EMOJI = { Groceries: '🛒', Household: '🧽', Electronics: '🔌', Clothing: '👕', 'Health & beauty': '🧴', Gifts: '🎁', Other: '🛍️' };
const ITEM_EMOJI_RULES = [
  ['blueberr', '🫐'], ['strawberr', '🍓'], ['raspberr', '🍇'], ['blackberr', '🫐'], ['pineapple', '🍍'],
  ['banana', '🍌'], ['apple', '🍎'], ['orange', '🍊'], ['lemon', '🍋'], ['lime', '🍋'],
  ['grape', '🍇'], ['watermelon', '🍉'], ['melon', '🍈'], ['peach', '🍑'], ['cherr', '🍒'],
  ['pear', '🍐'], ['mango', '🥭'], ['avocado', '🥑'], ['kiwi', '🥝'],
  ['carrot', '🥕'], ['popcorn', '🍿'], ['corn', '🌽'], ['mushroom', '🍄'], ['tomato', '🍅'], ['potato', '🥔'],
  ['onion', '🧅'], ['garlic', '🧄'], ['broccoli', '🥦'], ['cucumber', '🥒'], ['pepper', '🫑'],
  ['bread', '🍞'], ['bagel', '🥯'], ['croissant', '🥐'], ['cake', '🍰'], ['cheese', '🧀'],
  ['milk', '🥛'], ['egg', '🥚'], ['chicken', '🍗'], ['bacon', '🥓'], ['sausage', '🌭'],
  ['fish', '🐟'], ['salmon', '🐟'], ['shrimp', '🦐'], ['rice', '🍚'], ['pasta', '🍝'],
  ['noodle', '🍜'], ['chocolate', '🍫'], ['cookie', '🍪'], ['crisps', '🥔'], ['coffee', '☕'],
  ['tea', '🍵'], ['water', '💧'], ['juice', '🧃'], ['cleaner', '🧴'], ['detergent', '🧺'],
  ['toilet roll', '🧻'], ['sponge', '🧽'], ['shampoo', '🧴'], ['soap', '🧼'],
  ['gift', '🎁'], ['present', '🎁'], ['charger', '🔌'], ['headphone', '🎧'], ['sock', '🧦'],
];

const matchesTerm = (name, term) => term.includes(' ')
  ? name.includes(term)
  : name.split(/[^a-z0-9]+/).some((word) => word.startsWith(term));

function inferItem(title) {
  const name = title.trim().toLocaleLowerCase('en-GB');
  const emoji = ITEM_EMOJI_RULES.find(([word]) => matchesTerm(name, word))?.[1];
  const grocery = GROCERY_RULES.find(([, , words]) => words.some((word) => matchesTerm(name, word)));
  if (grocery) return { category: 'Groceries', subcategory: grocery[0], emoji: emoji || grocery[1] };
  const other = MAIN_CATEGORY_RULES.find(([, , words]) => words.some((word) => matchesTerm(name, word)));
  if (other) return { category: other[0], subcategory: '', emoji: emoji || other[1] };
  return { category: 'Groceries', subcategory: 'Pantry', emoji: GENERIC_EMOJI.Groceries };
}

const catOf = (i) => (CATEGORIES.includes(i.data?.category) ? i.data.category : 'Other');
const subcategoryOf = (item) => item.data?.subcategory || inferItem(item.title || '').subcategory || 'Other groceries';
const emojiOf = (item) => {
  const inferred = inferItem(item.title || '');
  return item.data?.emoji || (inferred.category === catOf(item) ? inferred.emoji : GENERIC_EMOJI[catOf(item)]);
};

export default {
  id: 'shopping',
  label: 'To-Buy',
  icon: '🛒',
  itemLabel: 'item',
  description: 'Things to buy, with links. Tick when bought, re-add with one tap.',
  statuses: [
    { id: 'needed', label: 'To buy', color: '#5b5bd6' },
    { id: 'bought', label: 'Bought', color: '#10b981' },
  ],
  defaultStatus: 'needed',
  doneStatus: 'bought',
  hideFilters: true,
  suggestFromItems: true, // quick-add autocompletes from previous items
  quickAddPlaceholder: 'Add item… (e.g. milk)',
  emptyText: 'Your list is empty.',
  fields: [
    { key: 'title', label: 'Item', type: 'text', required: true },
    { key: 'qty', label: 'Quantity', type: 'text', placeholder: 'e.g. 2 or 1 kg' },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORIES, default: 'Groceries' },
    { key: 'link', label: 'Where to buy (link)', type: 'url', placeholder: 'https://…' },
    { key: 'price', label: 'Price', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
    { key: 'remind_at', label: 'Remind me (push notification)', type: 'datetime' },
  ],
  sort: (a, b) => a.title.localeCompare(b.title),

  sections(items) {
    const need = items.filter((i) => i.status !== 'bought');
    const bought = items.filter((i) => i.status === 'bought')
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return [
      {
        title: 'Groceries',
        children: GROCERY_SUBCATEGORIES
          .map((subcategory) => ({
            title: subcategory,
            items: need.filter((item) => catOf(item) === 'Groceries' && subcategoryOf(item) === subcategory),
          }))
          .filter((section) => section.items.length),
      },
      ...CATEGORIES.filter((category) => category !== 'Groceries')
        .map((category) => ({ title: category, items: need.filter((item) => catOf(item) === category) })),
      { title: 'Bought – tap ↺ to add back', items: bought, collapsible: true, collapsed: true },
    ];
  },

  card(item, ctx) {
    const bought = item.status === 'bought';
    const data = item.data || {};
    return h('article', { class: 'card row shopping-card' + (bought ? ' done' : ''), onclick: ctx.edit },
      checkCircle(item, ctx),
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, `${emojiOf(item)} ${item.title || 'Untitled'}`),
        h('div', { class: 'meta' },
          data.qty ? h('span', { class: 'pill' }, data.qty) : null,
          data.price ? h('span', { class: 'pill' }, data.price) : null,
          linkOut(data.link, 'Buy'),
          reminderBadge(item))),
      bought ? h('button', { class: 'btn small', 'aria-label': 'Add back to list',
        onclick: (event) => { event.stopPropagation(); ctx.setStatus('needed'); } }, '↺') : null);
  },

  meta(item) {
    const d = item.data || {};
    return [
      d.qty ? h('span', { class: 'pill' }, d.qty) : null,
      d.price ? h('span', { class: 'pill' }, d.price) : null,
      linkOut(d.link, 'Buy'),
    ];
  },

  actions(item, ctx) {
    if (item.status !== 'bought') return null;
    return h('button', { class: 'btn small', 'aria-label': 'Add back to list',
      onclick: (e) => { e.stopPropagation(); ctx.setStatus('needed'); } }, '↺');
  },

  // Typing an item you bought before puts it back on the list instead of duplicating it
  async onQuickAdd(text, { items, create, update }) {
    const existing = items.find((i) => i.title.trim().toLowerCase() === text.toLowerCase());
    const inferred = inferItem(text);
    if (existing) {
      if (existing.status === 'bought') {
        return update(existing.id, { status: 'needed', data: { ...existing.data, ...inferred } });
      }
      return null;
    }
    return create({ title: text, ...inferred });
  },
};
