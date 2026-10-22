export const BUSINESS_TIME_ZONE = "Europe/Kyiv";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const SCHOOL_YEAR_PATTERN = /^(\d{4})-(\d{4})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return monthLengths[month - 1];
}

function parseYearAndMonth(value, pattern, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }

  const match = pattern.exec(value);
  if (!match) {
    throw new RangeError(`${name} has an invalid format`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (year === 0 || month < 1 || month > 12) {
    throw new RangeError(`${name} is not a valid calendar value`);
  }

  return { year, month };
}

/** Parses an exact YYYY-MM-DD calendar date without applying a time zone. */
export function parseCalendarDate(value) {
  const { year, month } = parseYearAndMonth(
    value,
    DATE_PATTERN,
    "calendarDate",
  );
  const day = Number(DATE_PATTERN.exec(value)[3]);

  if (day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError("calendarDate is not a valid calendar date");
  }

  return { year, month, day };
}

/** Parses an exact YYYY-MM service month. */
export function parseServiceMonth(value) {
  return parseYearAndMonth(value, MONTH_PATTERN, "serviceMonth");
}

export function parseSchoolYear(value) {
  if (typeof value !== "string") {
    throw new TypeError("schoolYear must be a string");
  }

  const match = SCHOOL_YEAR_PATTERN.exec(value);
  if (!match) {
    throw new RangeError("schoolYear has an invalid format");
  }

  const startYear = Number(match[1]);
  const endYear = Number(match[2]);

  if (startYear === 0 || endYear !== startYear + 1) {
    throw new RangeError("schoolYear must contain consecutive years");
  }

  return { startYear, endYear };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatCalendarDate({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

function formatServiceMonth({ year, month }) {
  return `${String(year).padStart(4, "0")}-${pad(month)}`;
}

/** Returns the YYYY-YYYY school year containing the supplied calendar date. */
export function getSchoolYear(calendarDate) {
  const { year, month } = parseCalendarDate(calendarDate);
  const startYear = month >= 9 ? year : year - 1;

  if (startYear === 0 || startYear > 9_998) {
    throw new RangeError("calendarDate is outside the supported school years");
  }

  return `${String(startYear).padStart(4, "0")}-${String(
    startYear + 1,
  ).padStart(4, "0")}`;
}

/** Calculates age on 1 September of a school year. */
export function calculateAgeOnSchoolYearStart(dateOfBirth, schoolYear) {
  const birth = parseCalendarDate(dateOfBirth);
  const { startYear } = parseSchoolYear(schoolYear);
  const reference = { year: startYear, month: 9, day: 1 };

  if (formatCalendarDate(birth) > formatCalendarDate(reference)) {
    throw new RangeError("dateOfBirth is after the school-year start");
  }

  return (
    startYear -
    birth.year -
    (birth.month > 9 || (birth.month === 9 && birth.day > 1) ? 1 : 0)
  );
}

/** Returns the month following a YYYY-MM month, including year rollover. */
export function getNextServiceMonth(serviceMonth) {
  const { year, month } = parseServiceMonth(serviceMonth);

  if (year === 9_999 && month === 12) {
    throw new RangeError("serviceMonth is outside the supported range");
  }

  return formatServiceMonth(
    month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 },
  );
}

/** The first billed month is the month after enrollment. */
export function getBillingStartMonth(enrollmentDate) {
  const { year, month } = parseCalendarDate(enrollmentDate);
  return getNextServiceMonth(formatServiceMonth({ year, month }));
}

function parseLocalTime(value) {
  if (typeof value !== "string") {
    throw new TypeError("localTime must be a string");
  }

  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new RangeError("localTime must use HH:mm or HH:mm:ss");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);

  if (hour > 23 || minute > 59 || second > 59) {
    throw new RangeError("localTime is not valid");
  }

  return { hour, minute, second };
}

function createFormatter(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    throw new RangeError("timeZone is not supported");
  }
}

function getZonedParts(instantMs, formatter) {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(instantMs))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function partsAsUtcMs(parts) {
  const instant = new Date(0);
  instant.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  instant.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return instant.getTime();
}

function sameDateTime(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

/**
 * Converts a local wall-clock value to a UTC Date using IANA time-zone data.
 * Non-existent local times during a DST transition are rejected.
 */
export function zonedDateTimeToUtc(
  calendarDate,
  localTime = "00:00:00",
  timeZone = BUSINESS_TIME_ZONE,
) {
  const desired = {
    ...parseCalendarDate(calendarDate),
    ...parseLocalTime(localTime),
  };
  const formatter = createFormatter(timeZone);
  const wallClockMs = partsAsUtcMs(desired);
  let candidateMs = wallClockMs;

  // Re-evaluate the offset because it may differ on opposite sides of DST.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const representedLocalMs = partsAsUtcMs(
      getZonedParts(candidateMs, formatter),
    );
    candidateMs = wallClockMs - (representedLocalMs - candidateMs);
  }

  if (!sameDateTime(getZonedParts(candidateMs, formatter), desired)) {
    throw new RangeError("local date-time does not exist in the time zone");
  }

  const possibleOffsetChangesMinutes = [30, 60, 90, 120];
  const isAmbiguous = possibleOffsetChangesMinutes.some((minutes) =>
    [-1, 1].some((direction) =>
      sameDateTime(
        getZonedParts(
          candidateMs + direction * minutes * 60 * 1_000,
          formatter,
        ),
        desired,
      ),
    ),
  );

  if (isAmbiguous) {
    throw new RangeError("local date-time is ambiguous in the time zone");
  }

  return new Date(candidateMs);
}

/** Returns the half-open UTC range [start, end) of a local service month. */
export function getServiceMonthUtcRange(
  serviceMonth,
  timeZone = BUSINESS_TIME_ZONE,
) {
  const { year, month } = parseServiceMonth(serviceMonth);
  const nextMonth = getNextServiceMonth(serviceMonth);

  return {
    start: zonedDateTimeToUtc(
      `${String(year).padStart(4, "0")}-${pad(month)}-01`,
      "00:00:00",
      timeZone,
    ),
    end: zonedDateTimeToUtc(`${nextMonth}-01`, "00:00:00", timeZone),
  };
}

function cloneValidInstant(value, name) {
  const instant = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError(`${name} must be a valid instant`);
  }

  return instant;
}

/** Production clock; services should receive it through dependency injection. */
export const systemClock = Object.freeze({
  now() {
    return new Date();
  },
});

/** Test clock that never replaces the global Date implementation. */
export function createFixedClock(instant) {
  const fixedInstant = cloneValidInstant(instant, "instant");

  return Object.freeze({
    now() {
      return new Date(fixedInstant);
    },
  });
}

export function getCurrentCalendarDate(clock, timeZone = BUSINESS_TIME_ZONE) {
  if (!clock || typeof clock.now !== "function") {
    throw new TypeError("clock must provide now()");
  }

  const now = cloneValidInstant(clock.now(), "clock.now()");
  const { year, month, day } = getZonedParts(
    now.getTime(),
    createFormatter(timeZone),
  );

  return formatCalendarDate({ year, month, day });
}

export function assertDateOfBirthNotInFuture(
  dateOfBirth,
  clock,
  timeZone = BUSINESS_TIME_ZONE,
) {
  parseCalendarDate(dateOfBirth);
  const today = getCurrentCalendarDate(clock, timeZone);

  if (dateOfBirth > today) {
    throw new RangeError("dateOfBirth must not be in the future");
  }

  return dateOfBirth;
}
