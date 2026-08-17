<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { NCard, NForm, NFormItem, NInput, NButton, useMessage } from 'naive-ui';
import { useAuthStore } from '@/store/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const message = useMessage();

const username = ref('admin');
const password = ref('');
const loading = ref(false);

async function handleLogin() {
  if (!username.value || !password.value) {
    message.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    await auth.login(username.value, password.value);
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e: any) {
    message.error(e.response?.data?.message ?? '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div style="height: 100vh; display: flex; align-items: center; justify-content: center; background: #f5f7fa">
    <n-card title="AgentFlow Studio 登录" style="width: 380px">
      <n-form @submit.prevent="handleLogin">
        <n-form-item label="用户名">
          <n-input v-model:value="username" placeholder="用户名" />
        </n-form-item>
        <n-form-item label="密码">
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="密码"
            @keyup.enter="handleLogin"
          />
        </n-form-item>
        <n-button type="primary" block :loading="loading" @click="handleLogin">登录</n-button>
      </n-form>
    </n-card>
  </div>
</template>
