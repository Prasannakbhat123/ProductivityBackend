import { Schema, model } from 'mongoose';

export interface ICategory {
  _id?: string;
  name: string;
  color?: string;
  icon?: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    color: { type: String, default: '#666666' },
    icon: { type: String, default: 'Tag' },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Category = model<ICategory>('Category', categorySchema);
