import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["RENT", "SALARY", "FOOD", "OTHER"],
      required: true,
    },
    amountCents: {
      type: Number,
      required: true,
      validate: Number.isSafeInteger,
    },
    serviceMonth: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    reason: { type: String, required: true, maxlength: 500 },
    status: {
      type: String,
      enum: ["DRAFT", "APPROVED", "CANCELLED"],
      default: "DRAFT",
      required: true,
    },
    paymentDate: {
      type: String,
      match: /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/,
    },
    paidAt: { type: Date },
    sourceKey: { type: String, maxlength: 160 },
    correctionOf: { type: mongoose.Schema.Types.ObjectId, ref: "Expense" },
    correctionDirection: { type: String, enum: ["INCREASE", "DECREASE"] },
    snapshot: { type: mongoose.Schema.Types.Mixed },
  },
  {
    collection: "expenses",
    strict: "throw",
    bufferCommands: false,
    timestamps: true,
  },
);
expenseSchema.index(
  { sourceKey: 1 },
  { unique: true, sparse: true, name: "expense_source_key_unique" },
);
expenseSchema.index({ serviceMonth: 1, status: 1, category: 1 });
export const ExpenseModel = mongoose.model("Expense", expenseSchema);
