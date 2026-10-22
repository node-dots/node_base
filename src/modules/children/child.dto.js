export function toChildDto(child) {
  return {
    id: child.id,
    firstName: child.firstName,
    lastName: child.lastName,
    middleName: child.middleName,
    dateOfBirth: child.dateOfBirth,
    status: child.status,
    guardians: child.guardians.map(({ personId, relationship }) => ({
      personId: personId.toString(),
      relationship,
    })),
    relatives: child.relatives.map(({ name, relationship, contact, note }) => ({
      name,
      relationship,
      contact,
      note,
    })),
    food: structuredClone(child.food),
    benefitCode: child.benefitCode,
  };
}
