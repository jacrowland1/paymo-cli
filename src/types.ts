export interface PaymoProject {
  id: number;
  name: string;
  code: string;
  description: string;
  client_id: number;
  active: boolean;
  billable: boolean;
  created_on: string;
  updated_on: string;
}

export interface PaymoTask {
  id: number;
  name: string;
  code: string;
  project_id: number;
  tasklist_id: number;
  complete: boolean;
  billable: boolean;
  description: string;
  users: number[];
  created_on: string;
  updated_on: string;
}

export interface PaymoEntry {
  id: number;
  task_id: number;
  user_id: number;
  project_id: number;
  date?: string;
  duration?: number;
  start_time?: string;
  end_time?: string;
  description: string;
  added_manually: boolean;
  is_bulk: boolean;
  billed: boolean;
  created_on: string;
  updated_on: string;
}

export interface CreateEntryPayload {
  task_id: number;
  date: string;
  duration: number;
  description: string;
}
