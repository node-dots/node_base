import { CATALOG_KIND, ROOM_TYPE } from "./catalog.constants.js";

export function assertAvailableGroupRoom(entry) {
  if (
    !entry ||
    entry.kind !== CATALOG_KIND.ROOM ||
    entry.roomType !== ROOM_TYPE.GROUP ||
    entry.active !== true
  ) {
    throw new RangeError("Потрібна доступна групова кімната");
  }

  return entry;
}

export function assertCatalogEntryCanBePhysicallyDeleted({
  referencesChecked,
  isReferenced,
}) {
  if (referencesChecked !== true) {
    throw new Error("Catalog reference check must complete before deletion");
  }

  if (isReferenced === true) {
    throw new RangeError(
      "Referenced catalog entries must be deactivated, not deleted",
    );
  }

  return true;
}
