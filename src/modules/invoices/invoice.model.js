import mongoose from "mongoose";

const partSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    amountCents: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    remainingCents: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    cancelled: { type: Boolean, required: true, default: false },
    cancelledAt: { type: Date },
  },
  { _id: false, strict: "throw" },
);

const invoiceSchema = new mongoose.Schema(
  {
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Child",
    },
    service: { type: String, required: true, enum: ["TUITION", "MEAL"] },
    serviceMonth: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    billingType: {
      type: String,
      required: true,
      enum: ["MONTHLY", "ANNUAL"],
      default: "MONTHLY",
    },
    status: {
      type: String,
      required: true,
      enum: ["OPEN", "PARTIAL", "PAID", "CANCELLED"],
      default: "OPEN",
    },
    origAmountCents: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    remainingAmountCents: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    tariffSnapshot: {
      code: { type: String, required: true },
      effectiveFrom: { type: String, required: true },
      amountCents: {
        type: Number,
        required: true,
        min: 0,
        validate: Number.isSafeInteger,
      },
    },
    benefitSnapshot: {
      code: { type: String, required: true },
      basisPoints: {
        type: Number,
        required: true,
        min: 0,
        max: 10_000,
        validate: Number.isSafeInteger,
      },
    },
    formula: { type: String, required: true, maxlength: 200 },
    dueAt: { type: Date, required: true },
    parts: {
      type: [partSchema],
      required: true,
      validate: {
        validator(items) {
          const billingType =
            this.billingType ?? this.getUpdate?.()?.$set?.billingType;
          if (billingType === "ANNUAL") return items.length === 12;
          if (billingType === "MONTHLY") return items.length === 1;
          return items.length === 1 || items.length === 12;
        },
        message: "Invoice part count must match billing type",
      },
    },
    reservedMonths: {
      type: [{ type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/ }],
      default: undefined,
    },
    paidAmountCents: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: Number.isSafeInteger,
    },
    refundableAmountCents: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: Number.isSafeInteger,
    },
    refundedAmountCents: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: Number.isSafeInteger,
    },
  },
  {
    collection: "invoices",
    strict: "throw",
    bufferCommands: false,
    timestamps: true,
  },
);

invoiceSchema.index(
  { childId: 1, service: 1, serviceMonth: 1 },
  { unique: true, name: "invoice_child_service_month_unique" },
);
invoiceSchema.index(
  { childId: 1, service: 1, reservedMonths: 1 },
  {
    unique: true,
    name: "invoice_child_service_reserved_month_unique",
    partialFilterExpression: { status: { $in: ["OPEN", "PARTIAL", "PAID"] } },
  },
);

invoiceSchema.pre("validate", function setReservedMonths() {
  if (!Array.isArray(this.reservedMonths)) {
    this.reservedMonths = this.parts
      .filter((part) => !part.cancelled)
      .map((part) => part.month);
  }
});

export const InvoiceModel = mongoose.model("Invoice", invoiceSchema);
