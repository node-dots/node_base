// Базові поля профілю для перегляду після перевірки доступу.
export function toPersonDto(person) {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    middleName: person.middleName,
    phone: person.phone,
    status: person.status,
  };
}

// Дозволений працівницький перегляд: без зарплати та секретів account.
export function toEmployeePersonDto(person) {
  const dto = toPersonDto(person);

  if (!person.employee) {
    return dto;
  }

  return {
    ...dto,
    employee: {
      positionCode: person.employee.positionCode,
      status: person.employee.status,
    },
  };
}

export function toEmployeeProfileDto(person, includeSalary = false) {
  const dto = toPersonDto(person);
  if (!person.employee) return dto;
  return {
    ...dto,
    employee: {
      positionCode: person.employee.positionCode,
      status: person.employee.status,
      startedAt: person.employee.startedAt,
      endedAt: person.employee.endedAt,
      subjectCode: person.employee.subjectCode,
      availability: structuredClone(person.employee.availability ?? []),
      ...(includeSalary ? { salaryMinor: person.employee.salaryMinor } : {}),
    },
  };
}
