const rawUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
const cleanUrl = rawUrl.replace(/^\[.*\]\((.*)\)$/, '$1').replace(/\/+$/, '');
export const API_BASE_URL: string = cleanUrl || (import.meta.env.PROD ? '' : 'http://localhost:8000');
