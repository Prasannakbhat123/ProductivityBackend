import { Schema, model } from 'mongoose';

const notebookSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '' },
    contentHtml: { type: String, default: '' },
  },
  {
    timestamps: true,
  },
);

export const Notebook = model('Notebook', notebookSchema);
