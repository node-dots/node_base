import { GROUP_STATUS } from "../groups/group.constants.js";
import { CATALOG_KIND } from "../catalog/catalog.constants.js";
import { POSITION_CODE } from "../catalog/catalog.constants.js";

function schoolYearForWeek(weekStart) {
  const [year, month] = weekStart.split("-").map(Number);
  const start = month >= 9 ? year : year - 1;
  return `${start}-${start + 1}`;
}

export class ScheduleSnapshotProvider {
  constructor({ groupModel, catalogModel, personModel }) {
    Object.assign(this, { groupModel, catalogModel, personModel });
  }

  async read(weekStart, { session } = {}) {
    const schoolYear = schoolYearForWeek(weekStart);
    const [groups, rooms, teachers, program] = await Promise.all([
      this.groupModel
        .find({ schoolYear, status: GROUP_STATUS.ACTIVE })
        .session(session ?? null)
        .lean(),
      this.catalogModel
        .find({ kind: CATALOG_KIND.ROOM })
        .session(session ?? null)
        .lean(),
      this.personModel
        .find({ "employee.positionCode": POSITION_CODE.TEACHER })
        .session(session ?? null)
        .lean(),
      this.catalogModel
        .findOne({
          kind: CATALOG_KIND.PROGRAM,
          code: "STANDARD_PROGRAM",
          active: true,
          effectiveFrom: { $lte: weekStart },
        })
        .sort({ effectiveFrom: -1, _id: -1 })
        .session(session ?? null)
        .lean(),
    ]);
    return {
      schoolYear,
      groups: groups.map((group) => ({
        id: group._id.toString(),
        status: group.status,
        schoolYear: group.schoolYear,
        roomId: group.roomId?.toString(),
        capacity: group.capacity,
      })),
      rooms: rooms.map((room) => ({
        id: room._id.toString(),
        active: room.active,
        roomType: room.roomType,
        capacity: room.capacity,
      })),
      teachers: teachers.map((person) => ({
        id: person._id.toString(),
        status: person.employee.status,
        positionCode: person.employee.positionCode,
        subjectCode: person.employee.subjectCode,
        availability: person.employee.availability ?? [],
      })),
      program: program?.lessons ?? [],
      programVersion: program
        ? {
            id: program._id.toString(),
            code: program.code,
            effectiveFrom: program.effectiveFrom,
          }
        : null,
    };
  }
}
