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
