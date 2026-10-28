const prodUrl = ['https://', '20.196.152.197.sslip.io'].join('');
export const API_BASE_URL: string = import.meta.env.PROD ? prodUrl : 'http://localhost:8000';
