export function parseApiError(error, fallbackMessage = "Something went wrong. Please try again.") {
  if (!error) return fallbackMessage;

  const detail = error.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const firstDetail = detail[0];
    if (typeof firstDetail === "string") {
      return firstDetail;
    }
    if (typeof firstDetail?.msg === "string") {
      return firstDetail.msg;
    }
  }

  if (typeof error.response?.data?.message === "string" && error.response.data.message.trim()) {
    return error.response.data.message;
  }

  if (error.code === "ERR_NETWORK") {
    return "Cannot reach server. Please check your internet connection.";
  }

  return fallbackMessage;
}
