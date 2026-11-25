import type { User } from '~/types/index';
export const useAuth = () => {
    const user = useState<User | null>('auth-user', () => null);

    // 获取用户
    async function fetchUser() {
        try {
            const { data } = await useFetch<User>('/api/users/me');
            user.value = data.value || null;
        } catch (error) {
            console.error('Error fetching user:', error);
            user.value = null;
        }
    }

    // 登出
    async function logout() {
        try {
            await $fetch('/api/users/logout', { method: 'POST' });
            user.value = null;
        } catch (error) {
            console.error('Error logging out:', error);
        }
    }

    return {
        user,
        fetchUser,
        logout,
    };
}
