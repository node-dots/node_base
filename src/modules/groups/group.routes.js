import { Router } from 'express';
import { validateBody } from '../../middleware/validateBody.js';
import { createGroupSchema } from './group.schema.js';

export function createGroupRoutes({ groupController }) {
  const router = Router();

  router.get('/', groupController.list.bind(groupController));
  router.get('/summary', groupController.summary.bind(groupController));
  router.get('/:id', groupController.get.bind(groupController));
  router.post('/', validateBody(createGroupSchema), groupController.create.bind(groupController));

  return router;
}
