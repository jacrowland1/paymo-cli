import axios, { AxiosInstance } from 'axios';

const BASE_URL = 'https://app.paymoapp.com/api';

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

export class PaymoClient {
  private client: AxiosInstance;
  private userId: number | null = null;

  constructor(email: string, password: string) {
    const token = Buffer.from(`${email}:${password}`).toString('base64');
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${token}`,
      },
    });
  }

  /** Get and cache the authenticated user's ID */
  async getUserId(): Promise<number> {
    if (this.userId === null) {
      const data = await this.me();
      this.userId = data.users[0].id;
    }
    return this.userId!;
  }

  async getProjects(activeOnly = true): Promise<PaymoProject[]> {
    const where = activeOnly ? '?where=active=true' : '';
    const response = await this.client.get(`/projects${where}`);
    return response.data.projects;
  }

  async getTasks(projectId?: number): Promise<PaymoTask[]> {
    const where = projectId ? `?where=project_id=${projectId}` : '';
    const response = await this.client.get(`/tasks${where}`);
    return response.data.tasks;
  }

  async createEntry(payload: CreateEntryPayload): Promise<PaymoEntry> {
    const userId = await this.getUserId();
    const response = await this.client.post('/entries', { ...payload, user_id: userId });
    return response.data.entries[0];
  }

  async getEntries(taskId: number, dateFrom: string, dateTo: string): Promise<PaymoEntry[]> {
    const userId = await this.getUserId();
    const where = `?where=user_id=${userId} and task_id=${taskId} and time_interval in ("${dateFrom}T00:00:00Z","${dateTo}T23:59:59Z")`;
    const response = await this.client.get(`/entries${where}`);
    return response.data.entries;
  }

  async getEntriesByDate(dateFrom: string, dateTo: string): Promise<PaymoEntry[]> {
    const userId = await this.getUserId();
    const where = `?where=user_id=${userId} and time_interval in ("${dateFrom}T00:00:00Z","${dateTo}T23:59:59Z")`;
    const response = await this.client.get(`/entries${where}`);
    return response.data.entries;
  }

  async deleteEntry(entryId: number): Promise<void> {
    await this.client.delete(`/entries/${entryId}`);
  }

  /** Verify credentials by fetching current user */
  async me(): Promise<any> {
    const response = await this.client.get('/me');
    return response.data;
  }
}
