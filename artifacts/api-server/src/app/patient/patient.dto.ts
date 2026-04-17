export interface MedicationEntry {
  brand: string;
  composition: string;
  salts: string[];
  type: 'chronic' | 'vitamin' | 'as-needed';
  addedOn?: Date;
  active?: boolean;
}

export interface CreatePatientDTO {
  name: string;
  email: string;
  password: string;
  age: number;
  gender: string;
  bloodGroup?: string;
  allergies?: string[];
  conditions?: string[];
}

export type UpdatePatientDTO = Partial<Omit<CreatePatientDTO, 'email' | 'password'>>;

export interface AddMedicationDTO {
  brand: string;
  composition: string;
  type: 'chronic' | 'vitamin' | 'as-needed';
}
