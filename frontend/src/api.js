import axios from 'axios';

const DEFAULT_API_BASE = import.meta.env.PROD
  ? 'https://bidforge-h3rr.onrender.com/api'
  : 'http://localhost:8000/api';
const DEFAULT_WS_BASE = import.meta.env.PROD
  ? 'wss://bidforge-h3rr.onrender.com'
  : 'ws://localhost:8000';

const API_BASE = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE;
const WS_BASE = import.meta.env.VITE_WS_BASE_URL || DEFAULT_WS_BASE;

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_role');
      localStorage.removeItem('auth_company_name');
    }
    return Promise.reject(error);
  },
);

export const login = (data) => api.post('/auth/login', data);
export const signup = (data) => api.post('/auth/signup', data);
export const getProfile = () => api.get('/auth/me');
export const updateProfile = (data) => api.patch('/auth/me', data);
export const getProfileSettings = () => api.get('/auth/settings');
export const updateProfileSettings = (data) => api.patch('/auth/settings', data);

// ─── RFQ endpoints ───
export const createRFQ = (data) => api.post('/rfqs', data);
export const updateRFQ = (id, data) => api.patch(`/rfqs/${id}`, data);
export const pauseRFQ = (id) => api.post(`/rfqs/${id}/pause`);
export const awardRFQ = (id, data) => api.post(`/rfqs/${id}/award`, data);
export const listRFQs = ({ page, page_size, status, name } = {}) => {
  const params = { page, page_size, status, name };
  return api.get('/rfqs', { params });
};
export const getRFQ = (id) => api.get(`/rfqs/${id}`);
export const deleteRFQ = (id) => api.delete(`/rfqs/${id}`);
export const getBidderMyAuctions = () => api.get('/bidder/my-auctions');

// ─── Bid endpoints ───
export const submitBid = (rfqId, data) => api.post(`/rfqs/${rfqId}/bids`, data);
export const getBids = (rfqId, params) => api.get(`/rfqs/${rfqId}/bids`, { params });
export const exportBids = (rfqId, params) =>
  api.get(`/rfqs/${rfqId}/bids/export`, { params, responseType: 'blob' });
export const getBidRevisions = (rfqId) => api.get(`/rfqs/${rfqId}/bid-revisions`);

// ─── Activity endpoints ───
export const getActivity = (rfqId, params) => api.get(`/rfqs/${rfqId}/activity`, { params });
export const exportActivity = (rfqId, params) =>
  api.get(`/rfqs/${rfqId}/activity/export`, { params, responseType: "blob" });

// ─── Metrics endpoints ───
export const getBidsPerRFQMetrics = (params) => api.get("/metrics/bids-per-rfq", { params });
export const getAvgBidsMetrics = (params) => api.get("/metrics/avg-bids", { params });
export const getWinningPriceTrendMetrics = (params) => api.get("/metrics/winning-price-trend", { params });
export const getExtensionsPerRFQMetrics = (params) => api.get("/metrics/extensions-per-rfq", { params });
export const getExtensionImpactMetrics = (params) => api.get("/metrics/extension-impact", { params });
export const getDashboardRecommendations = (data) => api.post("/dashboard/recommendations", data);

export const getWebSocketBase = () => WS_BASE;

export default api;
