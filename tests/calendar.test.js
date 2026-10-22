import test from "node:test";
import assert from "node:assert/strict";
import {
  assertDateOfBirthNotInFuture,
  calculateAgeOnSchoolYearStart,
  createFixedClock,
  getBillingStartMonth,
  getCurrentCalendarDate,
  getNextServiceMonth,
  getSchoolYear,
  getServiceMonthUtcRange,
  parseCalendarDate,
  parseSchoolYear,
  parseServiceMonth,
  zonedDateTimeToUtc,
} from "../src/utils/calendar.js";

test("календарні дати й місяці розбираються строго", () => {
  assert.deepEqual(parseCalendarDate("2024-02-29"), {
    year: 2024,
    month: 2,
    day: 29,
  });
  assert.deepEqual(parseServiceMonth("2026-10"), {
    year: 2026,
    month: 10,
  });
  assert.deepEqual(parseSchoolYear("2026-2027"), {
    startYear: 2026,
    endYear: 2027,
  });

  for (const value of [
    "2023-02-29",
    "2024-02-30",
    "2024-2-01",
    "2024-01-1",
    "2024-13-01",
    "2024-01-01T00:00:00Z",
  ]) {
    assert.throws(() => parseCalendarDate(value), RangeError);
  }

  for (const value of ["2024-1", "2024-00", "2024-13", "2024-01-01"]) {
    assert.throws(() => parseServiceMonth(value), RangeError);
  }

  assert.throws(() => parseSchoolYear("2026-2028"), RangeError);
});

test("навчальний рік змінюється першого вересня", () => {
  assert.equal(getSchoolYear("2026-08-31"), "2025-2026");
  assert.equal(getSchoolYear("2026-09-01"), "2026-2027");
});

test("вік фіксується на перше вересня навчального року", () => {
  assert.equal(calculateAgeOnSchoolYearStart("2022-09-01", "2026-2027"), 4);
  assert.equal(calculateAgeOnSchoolYearStart("2022-09-02", "2026-2027"), 3);
  assert.equal(calculateAgeOnSchoolYearStart("2022-08-31", "2026-2027"), 4);
  assert.throws(
    () => calculateAgeOnSchoolYearStart("2026-09-02", "2026-2027"),
    /after the school-year start/,
  );
});

test("перехід до наступного місяця враховує зміну року", () => {
  assert.equal(getNextServiceMonth("2026-10"), "2026-11");
  assert.equal(getNextServiceMonth("2026-12"), "2027-01");
  assert.equal(getBillingStartMonth("2026-10-15"), "2026-11");
});

test("локальний час Europe/Kyiv конвертується з сезонним offset", () => {
  assert.equal(
    zonedDateTimeToUtc("2026-01-15", "10:00").toISOString(),
    "2026-01-15T08:00:00.000Z",
  );
  assert.equal(
    zonedDateTimeToUtc("2026-07-15", "10:00").toISOString(),
    "2026-07-15T07:00:00.000Z",
  );
});

test("межі локального місяця є точним UTC-інтервалом навіть при DST", () => {
  const march = getServiceMonthUtcRange("2026-03");
  assert.equal(march.start.toISOString(), "2026-02-28T22:00:00.000Z");
  assert.equal(march.end.toISOString(), "2026-03-31T21:00:00.000Z");

  const october = getServiceMonthUtcRange("2026-10");
  assert.equal(october.start.toISOString(), "2026-09-30T21:00:00.000Z");
  assert.equal(october.end.toISOString(), "2026-10-31T22:00:00.000Z");
});

test("неіснуючий локальний час під час переходу DST відхиляється", () => {
  assert.throws(
    () => zonedDateTimeToUtc("2026-03-29", "03:30"),
    /does not exist/,
  );
});

test("неоднозначний локальний час під час переходу DST відхиляється", () => {
  assert.throws(() => zonedDateTimeToUtc("2026-10-25", "03:30"), /ambiguous/);
});

test("Clock керує поточним часом без підміни глобальної Date", () => {
  const winterClock = createFixedClock("2026-01-01T21:59:59.000Z");
  const kyivNextDayClock = createFixedClock("2026-01-01T22:00:00.000Z");

  assert.equal(getCurrentCalendarDate(winterClock), "2026-01-01");
  assert.equal(getCurrentCalendarDate(kyivNextDayClock), "2026-01-02");
  assert.notEqual(winterClock.now(), winterClock.now());

  assert.equal(
    assertDateOfBirthNotInFuture("2026-01-02", kyivNextDayClock),
    "2026-01-02",
  );
  assert.throws(
    () => assertDateOfBirthNotInFuture("2026-01-03", kyivNextDayClock),
    /future/,
  );
});

test("Clock та часові значення відхиляють некоректні входи", () => {
  assert.throws(() => createFixedClock("not-an-instant"), RangeError);
  assert.throws(() => getCurrentCalendarDate({}), TypeError);
  assert.throws(
    () => getCurrentCalendarDate({ now: () => "not-an-instant" }),
    RangeError,
  );
  assert.throws(() => zonedDateTimeToUtc("2026-01-01", "24:00"), RangeError);
  assert.throws(
    () => zonedDateTimeToUtc("2026-01-01", "10:00", "Not/AZone"),
    RangeError,
  );
});
