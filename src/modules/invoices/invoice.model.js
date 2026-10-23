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
      validate: (items) => items.length === 1,
    },
    paidAmountCents: {
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

export const InvoiceModel = mongoose.model("Invoice", invoiceSchema);
