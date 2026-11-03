import { Router } from "express";
import { GroupModel } from "./groups/group.model.js";
import { GroupRepository } from "./groups/group.repository.js";
import { GroupModule } from "./groups/group.module.js";
import { ChildModel } from "./children/child.model.js";
import { ChildRepository } from "./children/child.repository.js";
import { ChildService } from "./children/child.service.js";
import { ChildMembershipService } from "./children/childMembership.service.js";
import { ChildBenefitService } from "./children/childBenefit.service.js";
import { createChildRoutes } from "./children/child.routes.js";
import { CatalogModel } from "./catalog/catalog.model.js";
import { CatalogRepository } from "./catalog/catalog.repository.js";
import { FinancialCatalogService } from "./catalog/financialCatalog.service.js";
import { createFinancialCatalogRoutes } from "./catalog/financialCatalog.routes.js";
import { InvoiceModel } from "./invoices/invoice.model.js";
import { InvoiceRepository } from "./invoices/invoice.repository.js";
import { InvoiceService } from "./invoices/invoice.service.js";
import { createInvoiceRoutes } from "./invoices/invoice.routes.js";
import { PaymentModel } from "./payments/payment.model.js";
import { PaymentRepository } from "./payments/payment.repository.js";
import { PaymentService } from "./payments/payment.service.js";
import { createPaymentRoutes } from "./payments/payment.routes.js";
import { RefundModel } from "./payments/refund.model.js";
import { RefundRepository } from "./payments/refund.repository.js";
import { ExpenseModel } from "./expenses/expense.model.js";
import { ExpenseRepository } from "./expenses/expense.repository.js";
import { ExpenseService } from "./expenses/expense.service.js";
import { createExpenseRoutes } from "./expenses/expense.routes.js";
import { OpenMonthService } from "./expenses/openMonth.service.js";
import { AccountRolesService } from "./people/accountRoles.service.js";
import { createAccountRolesRoutes } from "./people/accountRoles.routes.js";
import { EmployeeService } from "./people/employee.service.js";
import { createEmployeeRoutes } from "./people/employee.routes.js";
import { authorizer } from "./people/access/authorizer.js";
import { FinancialScenarioService } from "./finance/scenario.service.js";
import { createScenarioRoutes } from "./finance/scenario.routes.js";

export function createApiRouter({
  groupRepository = new GroupRepository({ groupModel: GroupModel }),
  guardianGroupsReader = new ChildRepository({ childModel: ChildModel }),
  settingsRepository = new CatalogRepository({ catalogModel: CatalogModel }),
  authModule,
} = {}) {
  const router = Router();
  const groupModule = new GroupModule({
    groupRepository,
    guardianGroupsReader,
    authService: authModule?.authService,
    catalogRepository: settingsRepository,
    personRepository: authModule?.personRepository,
    childRepository: guardianGroupsReader,
    unitOfWork: authModule?.unitOfWork,
  });

  router.use("/groups", groupModule.router);
  if (authModule) {
    router.use("/auth", authModule.router ?? authModule);
    router.use(
      "/finance/scenarios",
      createScenarioRoutes({
        service: new FinancialScenarioService({ authorizer }),
        authService: authModule.authService,
      }),
    );
    const financialCatalogService = new FinancialCatalogService({
      catalogRepository: settingsRepository,
      authorizer,
      unitOfWork: authModule.unitOfWork,
    });
    router.use(
      "/catalog",
      createFinancialCatalogRoutes({
        service: financialCatalogService,
        authService: authModule.authService,
      }),
    );
    if (authModule.unitOfWork) {
      const expenseService = new ExpenseService({
        expenseRepository: new ExpenseRepository({
          expenseModel: ExpenseModel,
        }),
        authorizer,
        unitOfWork: authModule.unitOfWork,
      });
      const openMonthService = new OpenMonthService({
        expenseRepository: new ExpenseRepository({
          expenseModel: ExpenseModel,
        }),
        catalogRepository: settingsRepository,
        personRepository: authModule.personRepository,
        groupRepository,
        childRepository: guardianGroupsReader,
        authorizer,
        unitOfWork: authModule.unitOfWork,
      });
      router.use(
        "/expenses",
        createExpenseRoutes({
          service: expenseService,
          openMonthService,
          authService: authModule.authService,
        }),
      );
      const invoiceService = new InvoiceService({
        invoiceRepository: new InvoiceRepository({
          invoiceModel: InvoiceModel,
        }),
        childRepository: guardianGroupsReader,
        catalogRepository: settingsRepository,
        authorizer,
        unitOfWork: authModule.unitOfWork,
      });
      router.use(
        "/invoices",
        createInvoiceRoutes({
          service: invoiceService,
          authService: authModule.authService,
        }),
      );
      const paymentService = new PaymentService({
        paymentRepository: new PaymentRepository({
          paymentModel: PaymentModel,
        }),
        invoiceRepository: new InvoiceRepository({
          invoiceModel: InvoiceModel,
        }),
        childRepository: guardianGroupsReader,
        refundRepository: new RefundRepository({ refundModel: RefundModel }),
        authorizer,
        unitOfWork: authModule.unitOfWork,
      });
      router.use(
        "/payments",
        createPaymentRoutes({
          service: paymentService,
          authService: authModule.authService,
        }),
      );
    }
    if (authModule.personRepository && authModule.unitOfWork) {
      const childService = new ChildService({
        childRepository: guardianGroupsReader,
        personRepository: authModule.personRepository,
        groupAssignmentsReader: groupRepository,
        authorizer,
        unitOfWork: authModule.unitOfWork,
      });
      const childMembershipService = new ChildMembershipService({
        childRepository: guardianGroupsReader,
        groupRepository,
        catalogRepository: settingsRepository,
        invoiceRepository: new InvoiceRepository({
          invoiceModel: InvoiceModel,
        }),
        authorizer,
        unitOfWork: authModule.unitOfWork,
      });
      const childBenefitService = new ChildBenefitService({
        childRepository: guardianGroupsReader,
        catalogRepository: settingsRepository,
        authorizer,
        unitOfWork: authModule.unitOfWork,
      });
      router.use(
        "/children",
        createChildRoutes({
          childService,
          membershipService: childMembershipService,
          benefitService: childBenefitService,
          authService: authModule.authService,
        }),
      );

      const employeeService = new EmployeeService({
        personRepository: authModule.personRepository,
        catalogRepository: settingsRepository,
        groupRepository,
        unitOfWork: authModule.unitOfWork,
        authorizer,
      });
      router.use(
        "/people",
        createEmployeeRoutes({
          employeeService,
          authService: authModule.authService,
        }),
      );
      const accountRolesService = new AccountRolesService({
        authorizer,
        personRepository: authModule.personRepository,
        settingsRepository,
        unitOfWork: authModule.unitOfWork,
      });
      router.use(
        "/people",
        createAccountRolesRoutes({
          accountRolesService,
          authService: authModule.authService,
        }),
      );
    }
  }
  return router;
}
