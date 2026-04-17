export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
  age: number;
  gender: string;
  bloodGroup?: string;
  allergies?: string[];
  conditions?: string[];
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponseDTO {
  token: string;
  patient: {
    id: string;
    name: string;
    email: string;
    age: number;
    gender: string;
    bloodGroup?: string;
    allergies: string[];
    conditions: string[];
  };
}
