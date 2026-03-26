export const FOOD_MEAL_OPTIONS = [
  'Breakfast',
  'AM Snacks',
  'Lunch',
  'PM Snacks',
  'Dinner'
] as const;

export type FoodMealOption = typeof FOOD_MEAL_OPTIONS[number];
export type EventFoodInclusionMap = Record<string, FoodMealOption[]>;

const FOOD_MEAL_CODE_MAP: Record<string, FoodMealOption> = {
  breakfast: 'Breakfast',
  am_snacks: 'AM Snacks',
  amsnacks: 'AM Snacks',
  'am snacks': 'AM Snacks',
  lunch: 'Lunch',
  pm_snacks: 'PM Snacks',
  pmsnacks: 'PM Snacks',
  'pm snacks': 'PM Snacks',
  dinner: 'Dinner'
};

const FOOD_MEAL_LABEL_TO_CODE: Record<FoodMealOption, string> = {
  Breakfast: 'breakfast',
  'AM Snacks': 'am_snacks',
  Lunch: 'lunch',
  'PM Snacks': 'pm_snacks',
  Dinner: 'dinner'
};

const normalizeMeal = (value: string): FoodMealOption | null => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  return FOOD_MEAL_CODE_MAP[trimmedValue.toLowerCase()] || null;
};

const sortMeals = (meals: FoodMealOption[]) => {
  return [...meals].sort(
    (a, b) => FOOD_MEAL_OPTIONS.indexOf(a) - FOOD_MEAL_OPTIONS.indexOf(b)
  );
};

export const normalizeFoodInclusionMap = (
  foodMap: Partial<Record<string, string[] | FoodMealOption[]>> | null | undefined,
  validDates: string[] = []
): EventFoodInclusionMap => {
  const nextMap: EventFoodInclusionMap = {};
  const validDateSet = new Set(validDates);

  Object.entries(foodMap || {}).forEach(([date, meals]) => {
    if (!date) return;
    if (validDateSet.size > 0 && !validDateSet.has(date)) return;

    const normalizedMeals = sortMeals(
      Array.from(
        new Set(
          (meals || [])
            .map((meal) => normalizeMeal(meal))
            .filter((meal): meal is FoodMealOption => !!meal)
        )
      )
    );

    nextMap[date] = normalizedMeals;
  });

  validDates.forEach((date) => {
    if (!nextMap[date]) {
      nextMap[date] = [];
    }
  });

  return nextMap;
};

export const parseFoodInclusion = (
  rawEntries: string[] | null | undefined,
  validDates: string[] = []
): EventFoodInclusionMap => {
  const parsedMap: EventFoodInclusionMap = {};
  const validDateSet = new Set(validDates);

  (rawEntries || []).forEach((entry) => {
    const trimmedEntry = entry?.trim();
    if (!trimmedEntry) return;

    const separator =
      trimmedEntry.includes('=') ? '=' : trimmedEntry.includes('::') ? '::' : null;

    if (!separator) return;

    const [rawDate, rawMeals = ''] = trimmedEntry.split(separator);
    const date = rawDate?.trim();
    if (!date) return;
    if (validDateSet.size > 0 && !validDateSet.has(date)) return;

    const meals = sortMeals(
      Array.from(
        new Set(
          rawMeals
            .split(/[|,]/)
            .map((meal) => normalizeMeal(meal))
            .filter((meal): meal is FoodMealOption => !!meal)
        )
      )
    );

    parsedMap[date] = meals;
  });

  return normalizeFoodInclusionMap(parsedMap, validDates);
};

export const serializeFoodInclusion = (
  foodMap: Partial<Record<string, string[] | FoodMealOption[]>> | null | undefined,
  validDates: string[] = []
): string[] | null => {
  const normalizedMap = normalizeFoodInclusionMap(foodMap, validDates);
  const datesToSerialize = validDates.length > 0 ? validDates : Object.keys(normalizedMap).sort();

  const serializedEntries = datesToSerialize
    .filter((date) => (normalizedMap[date] || []).length > 0)
    .map((date) => {
      const mealCodes = normalizedMap[date].map((meal) => FOOD_MEAL_LABEL_TO_CODE[meal]);
      return `${date}=${mealCodes.join('|')}`;
    });

  return serializedEntries.length > 0 ? serializedEntries : null;
};
