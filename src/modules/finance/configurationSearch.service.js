import { AppError } from "../../utils/errors.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import { searchConfigurations } from "./configurationSearch.js";

export class ConfigurationSearchService {
  constructor({ authorizer, search = searchConfigurations }) {
    this.authorizer = authorizer;
    this.search = search;
    authorizer.assertKnown(PERMISSIONS.FINANCE_SCENARIOS_RUN);
  }
  async compare(input, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.FINANCE_SCENARIOS_RUN);
    try {
      return await this.search(input, {
        budget: { candidates: 1000, milliseconds: 5000 },
      });
    } catch (error) {
      throw new AppError(400, "INVALID_CONFIGURATION_SEARCH", error.message);
    }
  }
}
