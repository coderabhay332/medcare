export interface MedicationEntry {
  name: string;
  salt?: string;
  dosage?: string;
  frequency?: string;
  addedAt?: Date;
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
  name: string;
  salt?: string;
  dosage?: string;
  frequency?: string;
}
