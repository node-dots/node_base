import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Invoice",
    },
    amountCents: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    method: { type: String, required: true, enum: ["BANK_TRANSFER", "CASH"] },
    status: {
      type: String,
      required: true,
      enum: ["PENDING"],
      default: "PENDING",
    },
    payerPersonId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Person",
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Person",
    },
    idempotencyKey: {
      type: String,
      required: true,
      minlength: 8,
      maxlength: 120,
    },
    payloadHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    reportedAt: { type: Date, required: true },
  },
  {
    collection: "payments",
    strict: "throw",
    bufferCommands: false,
    timestamps: true,
  },
);

paymentSchema.index(
  { actorId: 1, idempotencyKey: 1 },
  { unique: true, name: "payment_actor_idempotency_unique" },
);
paymentSchema.index({ invoiceId: 1, reportedAt: 1 });

export const PaymentModel = mongoose.model("Payment", paymentSchema);
