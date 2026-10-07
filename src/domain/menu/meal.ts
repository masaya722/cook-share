import type { RecipeId } from "../recipe/recipe";
import { HOUSEHOLD_SERVINGS } from "../recipe/servings";
import { type CalendarDate, compareDates } from "../shared/calendar-date";
import { DomainError } from "../shared/domain-error";

export type MealId = string & { readonly __brand: "MealId" };
export type DishId = string & { readonly __brand: "DishId" };

/** 食事区分 */
export type MealTime = "breakfast" | "lunch" | "dinner";
export const MEAL_TIMES: readonly MealTime[] = ["breakfast", "lunch", "dinner"];
export const MEAL_TIME_LABELS: Record<MealTime, string> = { breakfast: "朝", lunch: "昼", dinner: "夜" };

/** 品: 献立に並ぶ 1 つの料理。必ずレシピを参照する */
export type Dish = {
  readonly id: DishId;
  readonly recipeId: RecipeId;
  /** その回に何人分作るか */
  readonly servingsToCook: number;
};

/** 残り物: 前の食事で多めに作った品を食べること */
export type Leftover = {
  readonly sourceDishId: DishId;
  readonly recipeId: RecipeId;
};

/** 残り物の元になる品が、いつの食事で何人分作られたか */
export type DishInMeal = Dish & { readonly date: CalendarDate; readonly mealTime: MealTime };

export type MenuEvent =
  | { type: "DishAdded"; dishId: DishId; recipeId: RecipeId; servingsToCook: number; date: CalendarDate; mealTime: MealTime }
  | { type: "DishRemoved"; dishId: DishId }
  | { type: "DishServingsChanged"; dishId: DishId; from: number; to: number }
  | { type: "LeftoverAdded"; sourceDishId: DishId }
  | { type: "LeftoverRemoved"; sourceDishId: DishId }
  | { type: "EatingOutMarked"; mealId: MealId }
  | { type: "EatingOutCancelled"; mealId: MealId };

function isBefore(a: { date: CalendarDate; mealTime: MealTime }, b: { date: CalendarDate; mealTime: MealTime }) {
  const byDate = compareDates(a.date, b.date);
  return byDate < 0 || (byDate === 0 && MEAL_TIMES.indexOf(a.mealTime) < MEAL_TIMES.indexOf(b.mealTime));
}

/**
 * 集約: 食事（ある日の朝・昼・夜の 1 回分）。献立はここに並ぶ品と残り物。
 * M1（日付×食事区分で 1 つ）はリポジトリ（DB の一意制約）で守る。
 */
export class Meal {
  private events: MenuEvent[] = [];

  private constructor(
    readonly id: MealId,
    readonly date: CalendarDate,
    readonly mealTime: MealTime,
    private _eatingOut: boolean,
    private _dishes: Dish[],
    private _leftovers: Leftover[],
  ) {}

  static plan(id: string, date: CalendarDate, mealTime: MealTime): Meal {
    return new Meal(id as MealId, date, mealTime, false, [], []);
  }

  static reconstitute(props: {
    id: string;
    date: CalendarDate;
    mealTime: MealTime;
    eatingOut: boolean;
    dishes: Dish[];
    leftovers: Leftover[];
  }): Meal {
    return new Meal(props.id as MealId, props.date, props.mealTime, props.eatingOut, [...props.dishes], [...props.leftovers]);
  }

  get eatingOut() {
    return this._eatingOut;
  }
  get dishes(): readonly Dish[] {
    return this._dishes;
  }
  get leftovers(): readonly Leftover[] {
    return this._leftovers;
  }
  /** 品も残り物もなく、外食でもない（保存しておく意味がない） */
  get isEmpty() {
    return !this._eatingOut && this._dishes.length === 0 && this._leftovers.length === 0;
  }

  /** 起きたことを取り出す（取り出すと空になる） */
  pullEvents(): MenuEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  addDish(dishId: string, recipeId: RecipeId, servingsToCook = HOUSEHOLD_SERVINGS): Dish {
    this.assertNotEatingOut();
    assertServings(servingsToCook);
    const dish: Dish = { id: dishId as DishId, recipeId, servingsToCook };
    this._dishes.push(dish);
    this.events.push({
      type: "DishAdded",
      dishId: dish.id,
      recipeId,
      servingsToCook,
      date: this.date,
      mealTime: this.mealTime,
    });
    return dish;
  }

  removeDish(dishId: DishId) {
    this.findDish(dishId);
    this._dishes = this._dishes.filter((d) => d.id !== dishId);
    this.events.push({ type: "DishRemoved", dishId });
  }

  /** M3: 作る人数は 1 人以上 */
  changeServings(dishId: DishId, servingsToCook: number) {
    assertServings(servingsToCook);
    const dish = this.findDish(dishId);
    if (dish.servingsToCook === servingsToCook) return;
    this._dishes = this._dishes.map((d) => (d.id === dishId ? { ...d, servingsToCook } : d));
    this.events.push({ type: "DishServingsChanged", dishId, from: dish.servingsToCook, to: servingsToCook });
  }

  /** M4: 外食の食事には品を入れられないので、並んでいた品と残り物は外れる */
  markEatingOut() {
    if (this._eatingOut) return;
    for (const dish of this._dishes) this.events.push({ type: "DishRemoved", dishId: dish.id });
    for (const l of this._leftovers) this.events.push({ type: "LeftoverRemoved", sourceDishId: l.sourceDishId });
    this._dishes = [];
    this._leftovers = [];
    this._eatingOut = true;
    this.events.push({ type: "EatingOutMarked", mealId: this.id });
  }

  cancelEatingOut() {
    if (!this._eatingOut) return;
    this._eatingOut = false;
    this.events.push({ type: "EatingOutCancelled", mealId: this.id });
  }

  /** M6: 残り物は、それより前の食事で多めに作った（2 人より多い）品だけ */
  addLeftover(source: DishInMeal) {
    this.assertNotEatingOut();
    if (!isBefore(source, this)) {
      throw new DomainError("残り物にできるのは、この食事より前に作った品だけです");
    }
    if (source.servingsToCook <= HOUSEHOLD_SERVINGS) {
      throw new DomainError("残り物にできるのは、多めに作った品だけです");
    }
    if (this._leftovers.some((l) => l.sourceDishId === source.id)) return;
    this._leftovers.push({ sourceDishId: source.id, recipeId: source.recipeId });
    this.events.push({ type: "LeftoverAdded", sourceDishId: source.id });
  }

  removeLeftover(sourceDishId: DishId) {
    if (!this._leftovers.some((l) => l.sourceDishId === sourceDishId)) return;
    this._leftovers = this._leftovers.filter((l) => l.sourceDishId !== sourceDishId);
    this.events.push({ type: "LeftoverRemoved", sourceDishId });
  }

  private findDish(dishId: DishId): Dish {
    const dish = this._dishes.find((d) => d.id === dishId);
    if (!dish) throw new DomainError("この品は献立にありません");
    return dish;
  }

  private assertNotEatingOut() {
    if (this._eatingOut) throw new DomainError("外食の日には品を入れられません");
  }
}

function assertServings(n: number) {
  if (!Number.isInteger(n) || n < 1) throw new DomainError("作る人数は 1 人以上にしてください");
}
