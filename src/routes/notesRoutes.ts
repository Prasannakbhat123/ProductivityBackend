import { Router } from 'express';
import { z } from 'zod';
import { Notebook } from '../models/Notebook';

export const notesRoutes = Router();

notesRoutes.get('/notebooks', async (_request, response) => {
  const notebooks = await Notebook.find().sort({ updatedAt: -1 });
  response.json(notebooks);
});

notesRoutes.post('/notebooks', async (request, response, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(120),
      imageUrl: z.string().url().optional().or(z.literal('')),
      contentHtml: z.string().optional(),
    });
    const input = schema.parse(request.body);
    const notebook = await Notebook.create({
      title: input.title,
      imageUrl: input.imageUrl ?? '',
      contentHtml: input.contentHtml ?? '',
    });
    response.status(201).json(notebook);
  } catch (error) {
    next(error);
  }
});

notesRoutes.patch('/notebooks/:id', async (request, response, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(120).optional(),
      imageUrl: z.string().url().optional().or(z.literal('')),
      contentHtml: z.string().optional(),
    });
    const input = schema.parse(request.body);
    const notebook = await Notebook.findByIdAndUpdate(request.params.id, input, { returnDocument: 'after' });
    if (!notebook) {
      response.status(404).json({ message: 'Notebook not found' });
      return;
    }
    response.json(notebook);
  } catch (error) {
    next(error);
  }
});

notesRoutes.delete('/notebooks/:id', async (request, response) => {
  const notebook = await Notebook.findByIdAndDelete(request.params.id);
  if (!notebook) {
    response.status(404).json({ message: 'Notebook not found' });
    return;
  }
  response.json({ message: 'Notebook deleted' });
});
