import mongoose from "mongoose";

const refundSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Payment",
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Invoice",
    },
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Child",
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Person",
    },
    amountCents: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 500,
    },
    idempotencyKey: {
      type: String,
      required: true,
      minlength: 8,
      maxlength: 120,
    },
    payloadHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    status: {
      type: String,
      required: true,
      enum: ["CONFIRMED"],
      default: "CONFIRMED",
    },
    recordedAt: { type: Date, required: true },
  },
  {
    collection: "refunds",
    strict: "throw",
    bufferCommands: false,
    timestamps: true,
  },
);

refundSchema.index(
  { actorId: 1, idempotencyKey: 1 },
  { unique: true, name: "refund_actor_idempotency_unique" },
);
refundSchema.index({ paymentId: 1, recordedAt: -1, _id: 1 });
refundSchema.index({ invoiceId: 1, recordedAt: -1, _id: 1 });

export const RefundModel = mongoose.model("Refund", refundSchema);
