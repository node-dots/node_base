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
