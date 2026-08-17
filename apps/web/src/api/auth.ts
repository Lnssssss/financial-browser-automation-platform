import { http } from './client';

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
}

export function login(username: string, password: string) {
  return http.post<LoginResponse>('/auth/login', { username, password }).then((r) => r.data);
}

export function fetchMe() {
  return http.get('/auth/me').then((r) => r.data);
}
