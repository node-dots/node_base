import { AppError } from "../../utils/errors.js";
import { PERMISSIONS } from "../../utils/access/permissions.js";
import {
  calculateFinancialForecast,
  findFinancialBreakeven,
} from "./scenario.calculations.js";

export class FinancialScenarioService {
  constructor({ authorizer }) {
    this.authorizer = authorizer;
    authorizer.assertKnown(PERMISSIONS.FINANCE_SCENARIOS_RUN);
  }
  forecast(input, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.FINANCE_SCENARIOS_RUN);
    try {
      return calculateFinancialForecast(input);
    } catch (error) {
      throw new AppError(400, "INVALID_FINANCIAL_SCENARIO", error.message);
    }
  }
  breakeven({ scenario, maxCandidates }, actor) {
    this.authorizer.assertPermission(actor, PERMISSIONS.FINANCE_SCENARIOS_RUN);
    try {
      return findFinancialBreakeven(scenario, { maxCandidates });
    } catch (error) {
      throw new AppError(400, "INVALID_FINANCIAL_SCENARIO", error.message);
    }
  }
}
