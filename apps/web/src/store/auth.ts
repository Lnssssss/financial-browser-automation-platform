import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as authApi from '@/api/auth';

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('accessToken'));
  const user = ref<CurrentUser | null>(null);

  async function login(username: string, password: string) {
    const res = await authApi.login(username, password);
    token.value = res.accessToken;
    user.value = res.user;
    localStorage.setItem('accessToken', res.accessToken);
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('accessToken');
  }

  const isAuthenticated = () => !!token.value;

  return { token, user, login, logout, isAuthenticated };
});
