import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { GroupModel } from '../../src/modules/groups/group.model.js';
import { GroupRepository } from '../../src/modules/groups/group.repository.js';
import { createApp } from '../../src/app.js';
import { createApiRouter } from '../../src/modules/index.js';
import { demoGroups } from '../../scripts/demo-groups.js';
import { isMongoReady } from '../../src/config/database.js';

test(
  'MongoDB: API, DTO, aggregation і збереження після повторного підключення',
  {
    skip: process.env.RUN_MONGO_TESTS !== 'true',
  },
  async () => {
    // Власна випадкова база; дані розробки не очищаються.
    const databaseName = `kindergarten_test_${randomUUID().replaceAll('-', '')}`;
    const uri = 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true';
    let connection = await mongoose
      .createConnection(uri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 })
      .asPromise();
    let server;
    try {
      const model = connection.model('Group', GroupModel.schema);
      await model.insertMany(demoGroups);
      await assert.rejects(
        model.create({ name: 'Дробовий вік', ageCategory: 2.5, capacity: 20, status: 'DRAFT' }),
      );
      const repository = new GroupRepository({ groupModel: model });
      assert.equal(await repository.findById('missing'), null);
      assert.equal(await repository.findById('ffffffffffffffffffffffff'), null);
      const expectedSummary = [
        { ageCategory: 2, groupsCount: 2, totalCapacity: 36 },
        { ageCategory: 3, groupsCount: 2, totalCapacity: 38 },
        { ageCategory: 4, groupsCount: 2, totalCapacity: 38 },
        { ageCategory: 5, groupsCount: 2, totalCapacity: 36 },
      ];
      assert.deepEqual(await repository.summarizeByAge(), expectedSummary);
      server = createApp({
        apiRouter: createApiRouter({ groupRepository: repository }),
        isStorageReady: () => isMongoReady(connection),
      }).listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/groups`;
      const healthUrl = `http://127.0.0.1:${server.address().port}/health`;
      assert.equal((await fetch(`${healthUrl}/ready`)).status, 200);
      const summary = await fetch(`${baseUrl}/summary`);
      assert.equal(summary.status, 200);
      assert.deepEqual((await summary.json()).data, expectedSummary);
      const created = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Перевірка збереження', ageCategory: 3, capacity: 12 }),
      });
      assert.equal(created.status, 201);
      const group = (await created.json()).data;
      assert.match(group.id, /^[a-f0-9]{24}$/);
      assert.deepEqual(Object.keys(group).sort(), [
        'ageCategory',
        'capacity',
        'id',
        'name',
        'status',
      ]);
      const read = await fetch(baseUrl + '/' + group.id);
      assert.deepEqual((await read.json()).data, group);
      assert.equal((await fetch(`${baseUrl}/invalid-id`)).status, 404);
      // Втрачаємо тільки тестове з’єднання, не зупиняємо спільну MongoDB команди.
      await connection.close();
      assert.equal((await fetch(`${healthUrl}/ready`)).status, 503);
      assert.equal((await fetch(`${healthUrl}/live`)).status, 200);
      await new Promise((resolve) => server.close(resolve));
      server = null;
      connection = await mongoose.createConnection(uri, { dbName: databaseName }).asPromise();
      assert.equal(await isMongoReady(connection), true);
      const reconnectedModel = connection.model('Group', GroupModel.schema);
      const reconnectedRepository = new GroupRepository({ groupModel: reconnectedModel });
      assert.deepEqual(await reconnectedRepository.findById(group.id), group);
      assert.equal((await reconnectedRepository.findAll()).length, 9);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await connection.dropDatabase(); // Тільки створена цим тестом випадкова база.
      await connection.close();
    }
  },
);
