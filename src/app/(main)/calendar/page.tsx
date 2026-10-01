import { MealCalendar } from "@/components/meal-calendar";
import { PageHeader } from "@/components/ui";

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="献立" />
      <MealCalendar />
    </>
  );
}
