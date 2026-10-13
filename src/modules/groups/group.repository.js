import mongoose from 'mongoose';

// Технічні поля MongoDB не виходять за межі репозиторію.
function toGroup(document) {
  return {
    id: document._id.toString(),
    name: document.name,
    ageCategory: document.ageCategory,
    capacity: document.capacity,
    status: document.status,
  };
}

export class GroupRepository {
  constructor({ groupModel }) {
    this.groupModel = groupModel;
  }

  async findAll() {
    const documents = await this.groupModel.find().sort({ _id: 1 }).lean();
    return documents.map(toGroup);
  }

  async findById(groupId) {
    // Некоректний ID, як і відсутній запис, повертає null замість CastError.
    if (!mongoose.isObjectIdOrHexString(groupId)) return null;
    const document = await this.groupModel.findById(groupId).lean();
    return document ? toGroup(document) : null;
  }

  async insert(group) {
    const document = await this.groupModel.create(group);
    return toGroup(document);
  }

  async summarizeByAge() {
    return this.groupModel.aggregate([
      {
        $group: {
          _id: '$ageCategory',
          groupsCount: { $sum: 1 },
          totalCapacity: { $sum: '$capacity' },
        },
      },
      { $project: { _id: 0, ageCategory: '$_id', groupsCount: 1, totalCapacity: 1 } },
      { $sort: { ageCategory: 1 } },
    ]);
  }
}
