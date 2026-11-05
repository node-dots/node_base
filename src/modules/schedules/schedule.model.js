import mongoose from "mongoose";

const slotSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, minlength: 1, maxlength: 80 },
    groupId: { type: mongoose.Schema.Types.ObjectId, required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, required: true },
    subjectCode: {
      type: String,
      required: true,
      match: /^[A-Z][A-Z0-9_]*$/,
    },
    weekday: { type: Number, required: true, min: 1, max: 5 },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  },
  { _id: false, strict: "throw" },
);

const scheduleSchema = new mongoose.Schema(
  {
    weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    revision: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    slots: { type: [slotSchema], required: true, default: [] },
    updatedById: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Person",
    },
  },
  {
    collection: "schedules",
    strict: "throw",
    bufferCommands: false,
    timestamps: true,
  },
);

scheduleSchema.index(
  { weekStart: 1 },
  { unique: true, name: "schedule_week_unique" },
);

export const ScheduleModel = mongoose.model("Schedule", scheduleSchema);
