import { applyDiscount, assertMoneyMinor } from "../../utils/money.js";
import { zonedDateTimeToUtc } from "../../utils/calendar.js";

export function countWeekdaysInServiceMonth(serviceMonth) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(serviceMonth))
    throw new RangeError("serviceMonth must use YYYY-MM");
  const [year, month] = serviceMonth.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let weekdays = 0;
  for (let day = 1; day <= days; day += 1) {
    const weekDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekDay >= 1 && weekDay <= 5) weekdays += 1;
  }
  return weekdays;
}

export function calculateTuitionCents(tariffCents, discountBasisPoints = 0) {
  return applyDiscount(assertMoneyMinor(tariffCents), discountBasisPoints);
}

export function calculateMealCents(dailyTariffCents, serviceMonth) {
  return assertMoneyMinor(
    assertMoneyMinor(dailyTariffCents) *
      countWeekdaysInServiceMonth(serviceMonth),
  );
}

export function invoiceDueAt(serviceMonth) {
  const eleventh = `${serviceMonth}-11`;
  return new Date(zonedDateTimeToUtc(eleventh, "00:00:00").getTime() - 1);
}
