import axios from 'axios';
import { Platform } from 'react-native';

// Important Networking Note:
// For testing on a physical phone using Expo Go on the same Wi-Fi, you must replace
// the local IPs below with your computer's actual Wi-Fi IPv4 address (e.g. 'http://192.168.1.5:3000/api').
// Android emulators running on the same PC use 'http://10.0.2.2:3000/api'.
// Web/iOS simulators can use localhost/127.0.0.1.
const API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000/api' : 'http://127.0.0.1:3000/api';

// Create an Axios instance pre-configured to point to our Express backend
export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.response.use(
    response => response,
    error => {
        let errorMsg = 'Network Error - Check PC IP Address connection';
        if (error.response) {
            errorMsg = error.response.data?.error || `Server Error: ${error.response.status}`;
            console.error(`[API ERROR] ${error.config.method.toUpperCase()} ${error.config.url} => ${error.response.status}:`, error.response.data);
        } else if (error.request) {
            console.error(`[API ERROR] No response received from ${error.config.url}. Is the backend running at ${API_URL}?`);
        } else {
            console.error(`[API ERROR]`, error.message);
        }
        return Promise.reject(new Error(errorMsg));
    }
);

// --- DASHBOARD API ENDPOINTS ---

export const getDashboardStats = (startDate = '', endDate = '', financeType = 'ALL') => {
    let url = `/dashboard?financeType=${financeType}`;
    if (startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    return api.get(url);
};
export const getUpcomingInstallments = (startDate = '', endDate = '', financeType = 'ALL') => {
    let url = `/installments/upcoming?financeType=${financeType}`;
    if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
    return api.get(url);
};

export const getOverdueInstallments = (startDate = '', endDate = '', financeType = 'ALL') => {
    let url = `/installments/overdue?financeType=${financeType}`;
    if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
    return api.get(url);
};

export const getTodayInstallments = (startDate = '', endDate = '', financeType = 'ALL') => {
    let url = `/installments/today?financeType=${financeType}`;
    if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
    return api.get(url);
};

export const getReportTrends = () => {
    return api.get('/reports/trends');
};

export const getCollections = (startDate = '', endDate = '', financeType = 'ALL', paymentMethod = 'ALL') => {
    let url = `/installments/collections?financeType=${financeType}&paymentMethod=${paymentMethod}`;
    if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
    return api.get(url);
};

export const getActionNeededInstallments = (startDate = '', endDate = '', financeType = 'ALL') => {
    let url = `/installments/action-needed?financeType=${financeType}`;
    if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
    return api.get(url);
};

export const getSettings = () => api.get('/settings');
export const updateSettings = (data) => api.post('/settings', data);

export const API_BASE_URL = API_URL; // Export base URL for filesystem downloads

export const getExportCustomers = (financeType) => api.get(`/export/customers?financeType=${financeType}`);
export const getExportUpcoming = (startDate, endDate, financeType) => {
    let url = `/export/upcoming?financeType=${financeType}`;
    if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
    return api.get(url);
};

export const getExportCustomerHistory = (customerId) => api.get(`/export/customer/${customerId}`);

export const getCustomers = () => api.get('/customers');
export const addCustomer = (data) => api.post('/customers', data);
export const bulkImportCustomers = (customersArray) => api.post('/customers/bulk', { customers: customersArray });
export const updateCustomer = (id, data) => api.put(`/customers/${id}`, data);
export const deleteCustomer = (id) => api.delete(`/customers/${id}`);

export const createLoan = (data) => api.post('/loans', data);
export const getCustomerLoans = (customerId) => api.get(`/customers/${customerId}/loans`);
export const getLoanDetails = (loanId) => api.get(`/loans/${loanId}`);
export const updateLoanStatus = (loanId, status) => api.patch(`/loans/${loanId}/status`, { status });
export const updateLoanDetails = (loanId, data) => api.put(`/loans/${loanId}`, data);

export const updateInstallmentStatus = (instId, status, amount, lateFee, otherCharges, paymentMethod, paidDate) => 
  api.patch(`/installments/${instId}/status`, { status, amount, late_fee: lateFee, other_charges: otherCharges, payment_method: paymentMethod, paid_date: paidDate });
export const editInstallment = (instId, amount, due_date) => api.put(`/installments/${instId}`, { amount, due_date });
export const markAllInstallmentsPaid = (loanId, paymentMethod, paidDate, finalAmount) => api.post(`/loans/${loanId}/mark-all-paid`, { payment_method: paymentMethod, paid_date: paidDate, final_amount: finalAmount });
