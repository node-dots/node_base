import test from "node:test";
import assert from "node:assert/strict";
import { createFixedClock } from "../src/utils/calendar.js";
import {
  CHILD_LIMITS,
  CHILD_STATUS,
} from "../src/modules/children/child.constants.js";
import {
  assertChildStateTransition,
  assertReadyForEnrollment,
  prepareApplicant,
  prepareChildProfileUpdate,
} from "../src/modules/children/child.rules.js";
import { toChildDto } from "../src/modules/children/child.dto.js";

const clock = createFixedClock("2026-10-22T12:00:00Z");
const guardian = {
  personId: "507f1f77bcf86cd799439011",
  relationship: "мати",
};

function applicant(overrides = {}) {
  return {
    firstName: "Марія",
    lastName: "Коваль",
    dateOfBirth: "2022-05-12",
    guardians: [guardian],
    ...overrides,
  };
}

test("створення завжди готує APPLICANT без місця та історії", () => {
  const prepared = prepareApplicant(applicant(), { clock });
  assert.equal(prepared.status, CHILD_STATUS.APPLICANT);
  assert.deepEqual(prepared.membershipHistory, []);
  assert.equal("groupId" in prepared, false);
  assert.equal("occupiedSeats" in prepared, false);
});

test("керовані enrollment-поля не приймаються в create або profile update", () => {
  for (const field of [
    "status",
    "groupId",
    "occupiedSeats",
    "membershipHistory",
  ]) {
    assert.throws(() =>
      prepareApplicant(applicant({ [field]: "x" }), { clock }),
    );
    assert.throws(() => prepareChildProfileUpdate({ [field]: "x" }, { clock }));
  }
});

test("DOB є календарною датою та не може бути майбутньою", () => {
  assert.throws(
    () => prepareApplicant(applicant({ dateOfBirth: "2026-10-23" }), { clock }),
    /future/,
  );
  assert.throws(() =>
    prepareApplicant(applicant({ dateOfBirth: "2024-02-30" }), { clock }),
  );
  assert.equal(
    prepareChildProfileUpdate({ dateOfBirth: "2026-10-22" }, { clock })
      .dateOfBirth,
    "2026-10-22",
  );
});

test("межі представників, родичів і харчових списків відхиляються", () => {
  assert.throws(() =>
    prepareApplicant(
      applicant({
        guardians: Array(CHILD_LIMITS.MAX_GUARDIANS + 1).fill(guardian),
      }),
      { clock },
    ),
  );
  const relative = { name: "Іван Коваль", relationship: "дідусь" };
  assert.throws(() =>
    prepareApplicant(
      applicant({
        relatives: Array(CHILD_LIMITS.MAX_RELATIVES + 1).fill(relative),
      }),
      { clock },
    ),
  );
  assert.throws(() =>
    prepareApplicant(
      applicant({
        food: {
          preferences: Array(CHILD_LIMITS.MAX_FOOD_ITEMS + 1).fill("яблуко"),
        },
      }),
      { clock },
    ),
  );
});

test("переходи станів явні, а LEFT не можна зарахувати повторно", () => {
  for (const [from, to] of [
    [CHILD_STATUS.APPLICANT, CHILD_STATUS.ACTIVE],
    [CHILD_STATUS.ACTIVE, CHILD_STATUS.SUSPENDED],
    [CHILD_STATUS.SUSPENDED, CHILD_STATUS.ACTIVE],
    [CHILD_STATUS.ACTIVE, CHILD_STATUS.LEFT],
    [CHILD_STATUS.SUSPENDED, CHILD_STATUS.LEFT],
  ])
    assert.equal(assertChildStateTransition(from, to), to);

  assert.throws(
    () => assertChildStateTransition(CHILD_STATUS.LEFT, CHILD_STATUS.ACTIVE),
    RangeError,
  );
  assert.throws(
    () => assertChildStateTransition(CHILD_STATUS.APPLICANT, CHILD_STATUS.LEFT),
    RangeError,
  );
});

test("для зарахування потрібен guardian, але родич не надає доступ", () => {
  const withRelativeOnly = prepareApplicant(
    applicant({
      guardians: [],
      relatives: [{ name: "Олег", relationship: "дядько" }],
    }),
    { clock },
  );
  assert.throws(() => assertReadyForEnrollment(withRelativeOnly), /guardian/);
  assert.equal(
    assertReadyForEnrollment(prepareApplicant(applicant(), { clock })).status,
    CHILD_STATUS.APPLICANT,
  );
});

test("однакові ім'я та DOB не блокуються схемою", () => {
  const first = prepareApplicant(applicant(), { clock });
  const duplicate = prepareApplicant(applicant(), { clock });
  assert.deepEqual(first, duplicate);
});

test("DTO повертає лише явний child contract без внутрішніх полів", () => {
  const dto = toChildDto({
    id: "child-id",
    ...prepareApplicant(applicant(), { clock }),
    __v: 7,
    occupiedSeats: 1,
    account: { passwordHash: "secret" },
  });
  assert.equal(dto.id, "child-id");
  assert.equal(dto.status, CHILD_STATUS.APPLICANT);
  assert.equal("__v" in dto, false);
  assert.equal("occupiedSeats" in dto, false);
  assert.equal("account" in dto, false);
});
