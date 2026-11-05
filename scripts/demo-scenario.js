import mongoose from "mongoose";
import assert from "node:assert/strict";
import {
  ACCOUNT_ROLE,
  PERSON_STATUS,
} from "../src/modules/people/person.constants.js";
import {
  POSITION_CODE,
  SUBJECT_CODE,
} from "../src/modules/catalog/catalog.constants.js";
import { CatalogModel } from "../src/modules/catalog/catalog.model.js";
import { CatalogRepository } from "../src/modules/catalog/catalog.repository.js";
import { GroupModel } from "../src/modules/groups/group.model.js";
import { GroupRepository } from "../src/modules/groups/group.repository.js";
import { GroupAccessPolicy } from "../src/modules/groups/groupAccessPolicy.js";
import { GroupService } from "../src/modules/groups/group.service.js";
import { PersonModel } from "../src/modules/people/person.model.js";
import { PersonRepository } from "../src/modules/people/person.repository.js";
import { EmployeeService } from "../src/modules/people/employee.service.js";
import { ChildModel } from "../src/modules/children/child.model.js";
import { ChildRepository } from "../src/modules/children/child.repository.js";
import { ChildService } from "../src/modules/children/child.service.js";
import { ChildMembershipService } from "../src/modules/children/childMembership.service.js";
import { InvoiceModel } from "../src/modules/invoices/invoice.model.js";
import { InvoiceRepository } from "../src/modules/invoices/invoice.repository.js";
import { InvoiceService } from "../src/modules/invoices/invoice.service.js";
import { PaymentModel } from "../src/modules/payments/payment.model.js";
import { PaymentRepository } from "../src/modules/payments/payment.repository.js";
import { RefundModel } from "../src/modules/payments/refund.model.js";
import { RefundRepository } from "../src/modules/payments/refund.repository.js";
import { PaymentService } from "../src/modules/payments/payment.service.js";
import { ExpenseModel } from "../src/modules/expenses/expense.model.js";
import { ExpenseRepository } from "../src/modules/expenses/expense.repository.js";
import { ExpenseService } from "../src/modules/expenses/expense.service.js";
import { FinanceReportRepository } from "../src/modules/reports/financeReport.repository.js";
import { FinanceReportService } from "../src/modules/reports/financeReport.service.js";
import { ScheduleModel } from "../src/modules/schedules/schedule.model.js";
import { ScheduleRepository } from "../src/modules/schedules/schedule.repository.js";
import { ScheduleService } from "../src/modules/schedules/schedule.service.js";
import { ScheduleSnapshotProvider } from "../src/modules/schedules/schedule.snapshot.js";
import { AuditModel } from "../src/modules/audit/audit.model.js";
import { AuditRepository } from "../src/modules/audit/audit.repository.js";
import { AuditWriter } from "../src/modules/audit/audit.writer.js";
import { UnitOfWork } from "../src/workflows/unitOfWork.js";
import { authorizer } from "../src/modules/people/access/authorizer.js";
import {
  createFixedClock,
  getCurrentCalendarDate,
  getSchoolYear,
  systemClock,
} from "../src/utils/calendar.js";
import { ensureDemoParents } from "./demo-people.js";
import { isSeedDatabaseAllowed } from "./seed-policy.js";

const demoPersonId = (number) => `d039${number.toString(16).padStart(20, "0")}`;

const demoEmployees = Object.freeze([
  ...[1, 2, 3].flatMap((group) => [
    {
      key: `educator-${group}`,
      id: demoPersonId(group * 2 - 1),
      firstName: "Demo",
      lastName: `Educator ${group}`,
      positionCode: POSITION_CODE.EDUCATOR,
      salaryMinor: 600_000,
    },
    {
      key: `assistant-${group}`,
      id: demoPersonId(group * 2),
      firstName: "Demo",
      lastName: `Assistant ${group}`,
      positionCode: POSITION_CODE.ASSISTANT,
      salaryMinor: 400_000,
    },
  ]),
  ...Object.values(SUBJECT_CODE).map((subjectCode, index) => ({
    key: `teacher-${subjectCode.toLowerCase()}`,
    id: demoPersonId(7 + index),
    firstName: "Demo",
    lastName: `Teacher ${subjectCode}`,
    positionCode: POSITION_CODE.TEACHER,
    subjectCode,
    salaryMinor: 500_000,
  })),
]);

const demoChildren = Object.freeze([
  ...Array.from({ length: 20 }, (_, index) => ({
    key: `child-full-group-${String(index + 1).padStart(2, "0")}`,
    firstName: "Demo Child",
    lastName: `Full Group ${String(index + 1).padStart(2, "0")}`,
    age: 2,
    parentIndex: index % 2,
    groupIndex: 0,
  })),
  {
    key: "child-annual-refund",
    firstName: "Demo Child",
    lastName: "Annual Refund",
    age: 4,
    parentIndex: 1,
    groupIndex: 2,
  },
  {
    key: "child-pending-payment",
    firstName: "Demo Child",
    lastName: "Pending Payment",
    age: 4,
    parentIndex: 0,
    groupIndex: 2,
  },
]);

function objectId(value) {
  return new mongoose.Types.ObjectId(value);
}

function fixtureDateOfBirth(age, schoolYear) {
  const startYear = Number(schoolYear.slice(0, 4));
  return `${String(startYear - age).padStart(4, "0")}-08-31`;
}

function thisWeekMonday(date) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result.toISOString().slice(0, 10);
}

function nextWeekMonday(weekStart) {
  const result = new Date(`${weekStart}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + 7);
  return result.toISOString().slice(0, 10);
}

function previousCalendarDay(date) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(0);
  return result.toISOString().slice(0, 10);
}

function createServices({ personRepository, unitOfWork, clock = systemClock }) {
  const catalogRepository = new CatalogRepository({
    catalogModel: CatalogModel,
  });
  const groupRepository = new GroupRepository({ groupModel: GroupModel });
  const childRepository = new ChildRepository({ childModel: ChildModel });
  const invoiceRepository = new InvoiceRepository({
    invoiceModel: InvoiceModel,
  });
  const groupAccessPolicy = new GroupAccessPolicy({
    groupAssignmentsReader: groupRepository,
    guardianGroupsReader: childRepository,
  });
  return {
    catalogRepository,
    groupRepository,
    childRepository,
    invoiceRepository,
    groupService: new GroupService({
      groupRepository,
      authorizer,
      groupAccessPolicy,
      catalogRepository,
      personRepository,
      childRepository,
      unitOfWork,
    }),
    employeeService: new EmployeeService({
      personRepository,
      catalogRepository,
      groupRepository,
      unitOfWork,
      authorizer,
    }),
    childService: new ChildService({
      childRepository,
      personRepository,
      groupAssignmentsReader: groupRepository,
      authorizer,
      unitOfWork,
    }),
    membershipService: new ChildMembershipService({
      childRepository,
      groupRepository,
      catalogRepository,
      invoiceRepository,
      authorizer,
      unitOfWork,
      clock,
    }),
    invoiceService: new InvoiceService({
      invoiceRepository,
      childRepository,
      catalogRepository,
      authorizer,
      unitOfWork,
      clock,
    }),
    paymentService: new PaymentService({
      paymentRepository: new PaymentRepository({ paymentModel: PaymentModel }),
      invoiceRepository,
      childRepository,
      refundRepository: new RefundRepository({ refundModel: RefundModel }),
      authorizer,
      unitOfWork,
      clock,
    }),
    expenseService: new ExpenseService({
      expenseRepository: new ExpenseRepository({ expenseModel: ExpenseModel }),
      authorizer,
      unitOfWork,
      clock,
    }),
    scheduleService: new ScheduleService({
      scheduleRepository: new ScheduleRepository({
        scheduleModel: ScheduleModel,
      }),
      authorizer,
      unitOfWork,
      catalogRepository,
      snapshotProvider: new ScheduleSnapshotProvider({
        groupModel: GroupModel,
        catalogModel: CatalogModel,
        personModel: PersonModel,
      }),
      guardianGroupsReader: childRepository,
      groupRepository,
      clock,
    }),
  };
}

async function ensureEmployees({
  personRepository,
  employeeService,
  actor,
  schoolYear,
}) {
  const employees = [];
  for (const fixture of demoEmployees) {
    const id = fixture.id;
    let person = await personRepository.findById(id);
    if (
      person &&
      (person.firstName !== fixture.firstName ||
        person.lastName !== fixture.lastName)
    ) {
      throw new Error(
        `Demo employee identity ${fixture.key} belongs to another person; it was not changed`,
      );
    }
    if (!person) {
      person = await personRepository.insert({
        _id: objectId(id),
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        status: PERSON_STATUS.ACTIVE,
      });
    }
    if (person.employee) {
      if (
        person.employee.positionCode !== fixture.positionCode ||
        person.employee.subjectCode !== fixture.subjectCode
      ) {
        throw new Error(
          `Demo employee identity ${fixture.key} has a conflicting role`,
        );
      }
    } else {
      await employeeService.update(
        id,
        {
          positionCode: fixture.positionCode,
          status: "ACTIVE",
          startedAt: `${schoolYear.slice(0, 4)}-09-01`,
          salaryMinor: fixture.salaryMinor,
          ...(fixture.subjectCode ? { subjectCode: fixture.subjectCode } : {}),
          availability:
            fixture.positionCode === POSITION_CODE.TEACHER
              ? [1, 2, 3, 4, 5].map((weekday) => ({
                  weekday,
                  startTime: "09:00",
                  endTime: "17:00",
                }))
              : [],
        },
        actor,
        `task-039-${fixture.key}`,
      );
      person = await personRepository.findById(id);
    }
    employees.push(person);
  }
  return employees;
}

async function ensureActiveGroups({ services, actor, employees, schoolYear }) {
  const categories = await Promise.all(
    [2, 4].map((age) =>
      services.catalogRepository.findActiveByCode("AGE_CATEGORY", `AGE_${age}`),
    ),
  );
  const rooms = await Promise.all(
    [1, 2, 3].map((index) =>
      services.catalogRepository.findActiveByCode(
        "ROOM",
        `GROUP_ROOM_${String(index).padStart(2, "0")}`,
      ),
    ),
  );
  if (categories.some((item) => !item) || rooms.some((item) => !item)) {
    throw new Error(
      "Required demo group catalog resources are missing or inactive",
    );
  }
  const groups = [];
  for (let index = 0; index < 3; index += 1) {
    const id = (index + 1).toString(16).padStart(24, "0");
    const current = await services.groupRepository.findById(id, {
      scope: { kind: "ALL" },
    });
    if (!current)
      throw new Error(
        `Demo group ${index + 1} is missing; run npm run seed first`,
      );
    const age = [2, 2, 4][index];
    const category = categories[age === 2 ? 0 : 1];
    const room = rooms[index];
    const capacity = [20, 16, 20][index];
    if (current.capacity !== capacity) {
      throw new Error(
        `Demo group ${index + 1} has a manually changed capacity; it was not changed`,
      );
    }
    const educator = employees[index * 2];
    const assistant = employees[index * 2 + 1];
    const resources = {
      schoolYear,
      ageCategoryId: category.id,
      roomId: room.id,
      educatorId: educator.id,
      assistantId: assistant.id,
      capacity,
    };
    if (current.status === "DRAFT") {
      groups.push(
        await services.groupService.updateResources(
          id,
          resources,
          actor,
          `task-039-group-${index + 1}`,
        ),
      );
      continue;
    }
    if (
      current.status !== "ACTIVE" ||
      Object.entries(resources).some(([key, value]) => current[key] !== value)
    ) {
      throw new Error(
        `Demo group ${index + 1} has existing manual or incompatible configuration; it was not changed`,
      );
    }
    groups.push(current);
  }
  return groups;
}

async function ensureDemoChild({
  fixture,
  parent,
  group,
  services,
  actor,
  schoolYear,
  category,
}) {
  const dateOfBirth = fixtureDateOfBirth(fixture.age, schoolYear);
  let stored = await ChildModel.findOne({
    firstName: fixture.firstName,
    lastName: fixture.lastName,
    dateOfBirth,
  }).lean();
  let child;
  if (stored) {
    child = await services.childRepository.findById(stored._id.toString());
    if (!child.guardians.some(({ personId }) => personId === parent.id)) {
      throw new Error(
        `Demo child ${fixture.key} exists with a different guardian; it was not changed`,
      );
    }
    if (child.status === "ACTIVE" && child.groupId !== group.id) {
      throw new Error(
        `Demo child ${fixture.key} is active in another group; it was not moved`,
      );
    }
  } else {
    child = await services.childService.createApplicant(
      {
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        dateOfBirth,
        guardians: [{ personId: parent.id, relationship: "parent" }],
        food: { preferences: [], exclusions: [], allergyNotes: [] },
      },
      actor,
      `task-039-${fixture.key}`,
    );
  }
  if (child.status === "APPLICANT") {
    child = await services.membershipService.enroll(
      child.id,
      group.id,
      actor,
      `task-039-enroll-${fixture.key}`,
    );
  }
  if (child.ageCategoryId && child.ageCategoryId !== category.id) {
    throw new Error(
      `Demo child ${fixture.key} has an incompatible age category; it was not changed`,
    );
  }
  return child;
}

function nextMonth(month) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number, 1));
  return date.toISOString().slice(0, 7);
}

async function ensurePayment({
  services,
  invoice,
  actor,
  payer,
  idempotencyKey,
  amountCents,
  confirm,
  now,
}) {
  const reported = await services.paymentService.reportPending(
    {
      invoiceId: invoice.id,
      amountCents,
      method: "BANK_TRANSFER",
      idempotencyKey,
      ...(!actor.roles.includes(ACCOUNT_ROLE.PARENT)
        ? { payerPersonId: payer.id }
        : {}),
    },
    actor,
    `task-039-${idempotencyKey}`,
  );
  if (confirm && reported.status === "PENDING") {
    return services.paymentService.confirm(
      reported.id,
      { occurredAt: now.toISOString() },
      actor,
      `task-039-confirm-${idempotencyKey}`,
    );
  }
  return reported;
}

async function ensureDemoSchedule({
  services,
  actor,
  groups,
  employees,
  weekStart,
}) {
  const existingPublished =
    await services.scheduleService.scheduleRepository.findPublished(weekStart);
  if (existingPublished) return existingPublished.published;
  const current = await services.scheduleService.getDraft(weekStart, actor);
  const subjects = Object.values(SUBJECT_CODE);
  const slots = [];
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    for (let round = 0; round < 2; round += 1) {
      const shift = (weekday - 1) * 2 + round;
      groups.forEach((group, groupIndex) => {
        const subjectCode = subjects[(groupIndex + shift) % subjects.length];
        const teacher = employees.find(
          ({ employee }) => employee.subjectCode === subjectCode,
        );
        slots.push({
          id: `demo-${groupIndex + 1}-${weekday}-${round + 1}`,
          groupId: group.id,
          roomId: group.roomId,
          teacherId: teacher.id,
          subjectCode,
          weekday,
          startTime: round === 0 ? "10:00" : "10:30",
          endTime: round === 0 ? "10:30" : "11:00",
        });
      });
    }
  }
  if (current.revision > 0 || current.slots.length > 0) {
    throw new Error(
      "An unpublished schedule draft already exists; it was not overwritten",
    );
  }
  const draft = await services.scheduleService.updateDraft(
    weekStart,
    { expectedRevision: current.revision, slots },
    actor,
  );
  return services.scheduleService.publish(
    weekStart,
    { expectedRevision: draft.revision },
    actor,
    "task-039-publish-demo-week",
  );
}

async function ensureDemoScheduleDraft({
  services,
  actor,
  weekStart,
  template,
}) {
  const current = await services.scheduleService.getDraft(weekStart, actor);
  const slot = { ...template, id: "demo-draft-next-week" };
  if (current.revision > 0 || current.slots.length > 0) {
    if (
      current.revision !== 1 ||
      current.slots.length !== 1 ||
      current.slots[0].id !== slot.id ||
      current.slots[0].groupId !== slot.groupId ||
      current.slots[0].roomId !== slot.roomId ||
      current.slots[0].teacherId !== slot.teacherId ||
      current.slots[0].subjectCode !== slot.subjectCode
    ) {
      throw new Error(
        "An incompatible next-week schedule draft exists; it was not overwritten",
      );
    }
    return current;
  }
  return services.scheduleService.updateDraft(
    weekStart,
    { expectedRevision: 0, slots: [slot] },
    actor,
  );
}

async function ensureDemoExpenses({ services, actor, month, today }) {
  const paidReason = "TASK-039 synthetic demo rent expense";
  let rent = await ExpenseModel.findOne({ reason: paidReason }).lean();
  if (!rent)
    rent = await services.expenseService.create(
      {
        category: "RENT",
        amountCents: 250_000,
        serviceMonth: month,
        reason: paidReason,
      },
      actor,
      "task-039-demo-rent",
    );
  else rent = { ...rent, id: rent._id.toString() };
  if (rent.status === "DRAFT")
    rent = await services.expenseService.approve(
      rent.id,
      actor,
      "task-039-approve-demo-rent",
    );
  if (rent.status === "APPROVED" && !rent.paidAt)
    rent = await services.expenseService.pay(
      rent.id,
      { paymentDate: today },
      actor,
      "task-039-pay-demo-rent",
    );

  const canceledReason = "TASK-039 synthetic demo canceled expense";
  let canceled = await ExpenseModel.findOne({ reason: canceledReason }).lean();
  if (!canceled)
    canceled = await services.expenseService.create(
      {
        category: "OTHER",
        amountCents: 12_500,
        serviceMonth: month,
        reason: canceledReason,
      },
      actor,
      "task-039-demo-canceled-expense",
    );
  else canceled = { ...canceled, id: canceled._id.toString() };
  if (canceled.status === "DRAFT")
    canceled = await services.expenseService.cancel(
      canceled.id,
      actor,
      "task-039-cancel-demo-expense",
    );

  const draftReason = "TASK-039 synthetic demo draft expense";
  let draft = await ExpenseModel.findOne({ reason: draftReason }).lean();
  if (!draft)
    draft = await services.expenseService.create(
      {
        category: "FOOD",
        amountCents: 35_000,
        serviceMonth: month,
        reason: draftReason,
      },
      actor,
      "task-039-demo-draft-expense",
    );
  else draft = { ...draft, id: draft._id.toString() };
  if (draft.status !== "DRAFT")
    throw new Error("The demo draft expense was changed; it was not rewritten");
  return { rent, canceled, draft };
}

export async function seedDemoScenario({
  databaseName,
  password = process.env.DEMO_PARENT_PASSWORD,
} = {}) {
  if (!isSeedDatabaseAllowed(databaseName)) {
    throw new Error(
      "Full demo seed is allowed only for kindergarten_dev or kindergarten_seed_test",
    );
  }
  const ownsConnection = mongoose.connection.readyState !== 1;
  if (ownsConnection) {
    await mongoose.connect(
      `mongodb://127.0.0.1:27017/${databaseName}?replicaSet=rs0&directConnection=true`,
      { serverSelectionTimeoutMS: 5000 },
    );
  }
  if (mongoose.connection.name !== databaseName) {
    if (ownsConnection) await mongoose.disconnect();
    throw new Error(
      "Connected MongoDB database does not match the seed allowlist target",
    );
  }
  try {
    return await runDemoScenario({ password, databaseName });
  } finally {
    if (ownsConnection) await mongoose.disconnect();
  }
}

async function runDemoScenario({ password, databaseName }) {
  const models = [
    PersonModel,
    CatalogModel,
    GroupModel,
    ChildModel,
    InvoiceModel,
    PaymentModel,
    RefundModel,
    ExpenseModel,
    ScheduleModel,
    AuditModel,
  ];
  await Promise.all(models.map((model) => model.init()));
  const auditRepository = new AuditRepository({ auditModel: AuditModel });
  const unitOfWork = new UnitOfWork({
    connection: mongoose.connection,
    auditWriter: new AuditWriter({ auditRepository, clock: systemClock }),
  });
  const personRepository = new PersonRepository({ personModel: PersonModel });
  const admin = await personRepository.findFirstEnabledAdmin();
  if (!admin)
    throw new Error("Run npm run bootstrap:admin before the full demo seed");
  const actor = { id: admin.id, roles: [ACCOUNT_ROLE.ADMIN] };
  const today = getCurrentCalendarDate(systemClock);
  const currentMonth = today.slice(0, 7);
  const followingMonth = nextMonth(currentMonth);
  const schoolYear = getSchoolYear(today);
  const services = createServices({ personRepository, unitOfWork });

  const parents = await ensureDemoParents({
    personRepository,
    unitOfWork,
    password,
    actorId: actor.id,
  });
  const employees = await ensureEmployees({
    personRepository,
    employeeService: services.employeeService,
    actor,
    schoolYear,
  });
  const groups = await ensureActiveGroups({
    services,
    actor,
    employees,
    schoolYear,
  });
  const categories = await Promise.all(
    [2, 4].map((age) =>
      services.catalogRepository.findActiveByCode("AGE_CATEGORY", `AGE_${age}`),
    ),
  );
  const children = [];
  const priorEnrollmentDate = previousCalendarDay(today);
  const enrollmentClockDate =
    getSchoolYear(priorEnrollmentDate) === schoolYear
      ? priorEnrollmentDate
      : today;
  const enrollmentServices = createServices({
    personRepository,
    unitOfWork,
    clock: createFixedClock(`${enrollmentClockDate}T12:00:00.000Z`),
  });
  for (const fixture of demoChildren) {
    const child = await ensureDemoChild({
      fixture,
      parent: parents[fixture.parentIndex],
      group: groups[fixture.groupIndex],
      services:
        fixture.key === "child-annual-refund" ? services : enrollmentServices,
      actor,
      schoolYear,
      category: categories[fixture.age === 2 ? 0 : 1],
    });
    children.push(child);
  }

  const monthlyInvoiceRows = [];
  for (const index of [0, demoChildren.length - 1]) {
    const child = children[index];
    const invoiceMonth =
      child.billingStartMonth > currentMonth
        ? child.billingStartMonth
        : currentMonth;
    const monthlyServices = createServices({
      personRepository,
      unitOfWork,
      clock: createFixedClock(`${invoiceMonth}-10T12:00:00.000Z`),
    });
    const result = await monthlyServices.invoiceService.generateForCurrentMonth(
      child.id,
      actor,
      `task-039-monthly-${index}`,
    );
    monthlyInvoiceRows.push(...result.invoices);
  }
  const fullChildTuition = monthlyInvoiceRows.find(
    (invoice) =>
      invoice.childId === children[0].id && invoice.service === "TUITION",
  );
  const pendingChildTuition = monthlyInvoiceRows.find(
    (invoice) =>
      invoice.childId === children[demoChildren.length - 1].id &&
      invoice.service === "TUITION",
  );
  if (!fullChildTuition || !pendingChildTuition)
    throw new Error("Monthly demo invoices were not generated");

  const confirmedPayment = await ensurePayment({
    services,
    invoice: fullChildTuition,
    actor,
    payer: parents[0],
    idempotencyKey: "task039-confirmed-monthly-payment",
    amountCents: fullChildTuition.origAmountCents,
    confirm: true,
    now: systemClock.now(),
  });
  const pendingPayment = await ensurePayment({
    services,
    invoice: pendingChildTuition,
    actor: { id: parents[0].id, roles: [ACCOUNT_ROLE.PARENT] },
    payer: parents[0],
    idempotencyKey: "task039-pending-monthly-payment",
    amountCents: Math.min(50_000, pendingChildTuition.origAmountCents),
    confirm: false,
    now: systemClock.now(),
  });

  const annualBillingChild = children[demoChildren.length - 2];
  let annualInvoice = await services.invoiceRepository.findByUnique({
    childId: annualBillingChild.id,
    service: "TUITION",
    serviceMonth: annualBillingChild.billingStartMonth,
  });
  if (!annualInvoice)
    annualInvoice = await services.invoiceService.createAnnualTuition(
      annualBillingChild.id,
      annualBillingChild.billingStartMonth,
      actor,
      "task-039-annual-tuition",
    );
  const annualPayment = await ensurePayment({
    services,
    invoice: annualInvoice,
    actor,
    payer: parents[1],
    idempotencyKey: "task039-annual-confirmed-payment",
    amountCents: annualInvoice.origAmountCents,
    confirm: true,
    now: systemClock.now(),
  });
  let annualChild = await services.childRepository.findById(
    children[demoChildren.length - 2].id,
  );
  if (annualChild.status !== "LEFT") {
    const withdrawal = await services.membershipService.withdraw(
      annualChild.id,
      actor,
      "task-039-withdraw-annual-demo-child",
    );
    annualChild = withdrawal.child;
  }
  const refund = await services.paymentService.refund(
    annualPayment.id,
    {
      amountCents: annualInvoice.origAmountCents,
      reason: "Synthetic demo annual tuition refund after withdrawal",
      idempotencyKey: "task039-annual-refund",
    },
    actor,
    "task-039-annual-refund",
  );
  assert.equal(
    (
      await services.childService.get(children[0].id, {
        id: parents[0].id,
        roles: [ACCOUNT_ROLE.PARENT],
      })
    ).id,
    children[0].id,
    "a parent should read their own child's record",
  );
  await assert.rejects(
    services.childService.get(children[demoChildren.length - 2].id, {
      id: parents[0].id,
      roles: [ACCOUNT_ROLE.PARENT],
    }),
    { code: "CHILD_NOT_FOUND" },
    "a parent must not read another family's child",
  );

  const expenses = await ensureDemoExpenses({
    services,
    actor,
    month: currentMonth,
    today,
  });
  const weekStart = thisWeekMonday(today);
  const publishedSchedule = await ensureDemoSchedule({
    services,
    actor,
    groups,
    employees,
    weekStart,
  });
  const draftWeek = nextWeekMonday(weekStart);
  const scheduleDraft = await ensureDemoScheduleDraft({
    services,
    actor,
    weekStart: draftWeek,
    template: publishedSchedule.slots[0],
  });

  const actualGroupOccupancy = await Promise.all(
    groups.map(async (group) => ({
      id: group.id,
      capacity: group.capacity,
      occupied: await services.childRepository.countOccupiedByGroup(group.id),
    })),
  );
  assert.deepEqual(
    actualGroupOccupancy.map(({ occupied, capacity }) => [occupied, capacity]),
    [
      [20, 20],
      [0, 16],
      [1, 20],
    ],
    "demo data must cover a full, empty, and partially occupied group",
  );
  const financeReportService = new FinanceReportService({
    reportRepository: new FinanceReportRepository({
      invoiceModel: InvoiceModel,
      paymentModel: PaymentModel,
      refundModel: RefundModel,
      expenseModel: ExpenseModel,
    }),
    invoiceRepository: services.invoiceRepository,
    authorizer,
  });
  const finance = await financeReportService.monthly(currentMonth, actor);
  assert.ok(Number.isSafeInteger(finance.accruedIncomeMinor));
  assert.ok(Number.isSafeInteger(finance.cashFlowMinor));
  assert.ok(finance.receiptsNetMinor > 0);
  assert.ok(finance.cashFlowMinor > 0);
  const currentMonthInvoiceCount = [
    fullChildTuition,
    pendingChildTuition,
  ].filter((invoice) => invoice.serviceMonth === currentMonth).length;
  if (currentMonthInvoiceCount > 0) assert.ok(finance.accruedIncomeMinor > 0);
  const result = {
    database: databaseName,
    parents: parents.length,
    employees: employees.length,
    groups: groups.length,
    children: await ChildModel.countDocuments({
      lastName: { $in: demoChildren.map(({ lastName }) => lastName) },
    }),
    invoices: await InvoiceModel.countDocuments({
      childId: { $in: children.map(({ id }) => objectId(id)) },
    }),
    confirmedPayment: confirmedPayment.status,
    pendingPayment: pendingPayment.status,
    annualPayment: annualPayment.status,
    refund: refund.status,
    finance: {
      month: currentMonth,
      accruedIncomeMinor: finance.accruedIncomeMinor,
      receiptsNetMinor: finance.receiptsNetMinor,
      expensesMinor: finance.expensesMinor,
      cashFlowMinor: finance.cashFlowMinor,
    },
    currentMonthInvoiceCount,
    expenses: {
      rent: expenses.rent.status,
      canceled: expenses.canceled.status,
      draft: expenses.draft.status,
    },
    publishedWeek: publishedSchedule.weekStart,
    draftWeek: scheduleDraft.weekStart,
    records: {
      groups: groups.map(({ id }) => id),
      children: Object.fromEntries(
        demoChildren.map(({ key }, index) => [key, children[index].id]),
      ),
      invoices: {
        paidMonthly: fullChildTuition.id,
        pendingMonthly: pendingChildTuition.id,
        annualTuition: annualInvoice.id,
      },
      payments: {
        confirmedMonthly: confirmedPayment.id,
        pendingMonthly: pendingPayment.id,
        annualTuition: annualPayment.id,
      },
      refund: refund.id,
      expenses: {
        rent: expenses.rent.id,
        canceled: expenses.canceled.id,
        draft: expenses.draft.id,
      },
      scheduleDraftWeek: scheduleDraft.weekStart,
    },
    groupOccupancy: actualGroupOccupancy,
  };
  assert.equal(
    result.children,
    demoChildren.length,
    "demo child identities must not duplicate on seed reruns",
  );
  assert.equal(
    result.invoices,
    5,
    "monthly and annual demo billing must be present exactly once",
  );
  assert.equal(result.confirmedPayment, "CONFIRMED");
  assert.equal(result.pendingPayment, "PENDING");
  assert.equal(result.annualPayment, "CONFIRMED");
  assert.equal(result.refund, "CONFIRMED");
  assert.equal(result.expenses.canceled, "CANCELLED");
  assert.equal(result.expenses.draft, "DRAFT");
  assert.equal(scheduleDraft.slots.length, 1);
  assert.equal(
    publishedSchedule.slots.length,
    30,
    "published demo schedule must cover the configured program",
  );
  if (
    actualGroupOccupancy.some(({ occupied, capacity }) => occupied > capacity)
  ) {
    throw new Error("Demo fixture violates a group capacity constraint");
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}
