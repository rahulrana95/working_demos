/*
 * NOT PART OF THE INTERVIEW: production version.
 * The menu of the demo restaurant: 20 categories and 400 dishes. Ten dishes
 * are written by hand. The others are made from two lists of words, so the
 * file stays short.
 */
import type { MenuCategory, MenuItem } from "../ordering";

const rupees = (amount: number) => amount * 100;
const PICTURES = 8;

function dish(id: string, name: string, description: string, price: number, isVeg: boolean) {
  return { id, name, description, price, isVeg, available: true };
}

const BY_HAND: MenuItem[] = [
  dish(
    "paneer-tikka",
    "Paneer Tikka",
    "Grilled cottage cheese with mint chutney.",
    rupees(220),
    true,
  ),
  dish("butter-naan", "Butter Naan", "Soft bread from the clay oven.", rupees(60), true),
  dish("samosa", "Samosa (2 pieces)", "Potato and peas in a crisp shell.", 4550, true),
  dish("chicken-65", "Chicken 65", "Fried chicken with curry leaves. Spicy.", rupees(260), false),
  dish("dal-makhani", "Dal Makhani", "Black lentils cooked slowly with butter.", rupees(240), true),
  dish("butter-chicken", "Butter Chicken", "Chicken in a mild tomato sauce.", rupees(320), false),
  {
    ...dish(
      "veg-biryani",
      "Vegetable Biryani",
      "Rice with vegetables and spices.",
      rupees(280),
      true,
    ),
    available: false,
  },
  dish("roti", "Tandoori Roti", "Whole wheat bread from the clay oven.", rupees(35), true),
  dish("lassi", "Sweet Lassi", "A cold yoghurt drink.", rupees(90), true),
  dish("masala-chai", "Masala Chai", "Tea with milk and spices.", rupees(40), true),
];

/** Category name, the word for one dish of it, and whether it is vegetarian. */
const CATEGORIES: [string, string, boolean][] = [
  ["Recommended", "Combo", true],
  ["Starters", "Kebab", false],
  ["Soups", "Soup", true],
  ["Salads", "Salad", true],
  ["Tandoor", "Tandoori Platter", false],
  ["Curries", "Curry", true],
  ["Dal", "Dal", true],
  ["Paneer", "Paneer", true],
  ["Chicken", "Chicken", false],
  ["Mutton", "Mutton", false],
  ["Seafood", "Fish", false],
  ["Biryani", "Biryani", false],
  ["Rice", "Pulao", true],
  ["Breads", "Kulcha", true],
  ["South Indian", "Dosa", true],
  ["Indo-Chinese", "Noodles", true],
  ["Rolls", "Roll", false],
  ["Thali", "Thali", true],
  ["Desserts", "Kheer", true],
  ["Drinks", "Sharbat", true],
];

const STYLES = [
  "Masala",
  "Makhani",
  "Tikka",
  "Kadai",
  "Handi",
  "Achari",
  "Hariyali",
  "Malai",
  "Lasooni",
  "Peshawari",
  "Kolhapuri",
  "Chettinad",
  "Hyderabadi",
  "Amritsari",
  "Punjabi",
  "Mughlai",
  "Tawa",
  "Dum",
  "Special",
  "Classic",
];

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Builds the menu. Every dish gets one of eight small pictures. */
export function createDemoMenu(): MenuCategory[] {
  let dishNumber = 0;

  return CATEGORIES.map(([categoryName, dishWord, isVeg], categoryIndex) => {
    const made: MenuItem[] = STYLES.map((style, styleIndex) => ({
      // Two dashes, so a made id is never the id of a dish written by hand.
      id: `${slug(categoryName)}--${slug(style)}`,
      name: `${style} ${dishWord}`,
      description: `${dishWord} in the ${style.toLowerCase()} style of the house.`,
      // From ₹80.00 to ₹370.50, in whole paise.
      price:
        rupees(80 + ((categoryIndex * 37 + styleIndex * 53) % 30) * 10) + (styleIndex % 2) * 50,
      isVeg,
      available: (categoryIndex * STYLES.length + styleIndex) % 23 !== 22,
    }));
    // The first category starts with the ten dishes written by hand.
    const items = categoryIndex === 0 ? [...BY_HAND, ...made.slice(BY_HAND.length)] : made;

    return {
      id: slug(categoryName),
      name: categoryName,
      items: items.map((item) => ({
        ...item,
        imageUrl: `dishes/${(dishNumber++ % PICTURES) + 1}.svg`,
      })),
    };
  });
}
